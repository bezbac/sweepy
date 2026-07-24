import path from "node:path";

import { Console, Effect } from "effect";
import {
  type BindingElement,
  type Expression,
  type ExpressionWithTypeArguments,
  type Identifier,
  type InterfaceDeclaration,
  Node,
  type SourceFile,
  SyntaxKind,
  type TypeAliasDeclaration,
  type TypeLiteralNode,
  type TypeNode,
  VariableDeclarationKind,
} from "ts-morph";

import {
  preserveSweepyError,
  UnsupportedComponentDeclarationError,
} from "../errors";
import { executeChanges } from "../execute-changes";
import {
  type ComponentFunction,
  type PropActionOptions,
  getComponentFunction,
  getForwardRefCall,
  getChangedFiles,
  getLocalComponentNames,
  getOrExtractPropsDeclaration,
  loadPropActionProject,
  removeEmptyPropsDeclaration,
} from "../prop-action";
import {
  formatUnsupportedCases,
  type UnsupportedCase,
} from "../unsupported-case";

type NarrowPropsOptions = PropActionOptions & {
  readonly yes: boolean;
  readonly dryRun: boolean;
};

const unwrapExpression = (expression: Expression): Expression => {
  if (
    Node.isParenthesizedExpression(expression) ||
    Node.isAsExpression(expression) ||
    Node.isTypeAssertion(expression) ||
    Node.isSatisfiesExpression(expression)
  ) {
    return unwrapExpression(expression.getExpression());
  }
  return expression;
};

const getStaticName = (node: Node | undefined) => {
  if (node === undefined) return undefined;
  if (Node.isIdentifier(node)) return node.getText();
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralValue();
  }
  if (Node.isNumericLiteral(node)) return String(node.getLiteralValue());
  return undefined;
};

const collectBindingNames = (
  elements: ReadonlyArray<BindingElement>,
  names: Set<string>,
) => {
  const restBindings: Array<BindingElement> = [];
  for (const element of elements) {
    if (element.getDotDotDotToken() !== undefined) {
      restBindings.push(element);
      continue;
    }
    const name = getStaticName(
      element.getPropertyNameNode() ?? element.getNameNode(),
    );
    if (name !== undefined) names.add(name);
  }
  return restBindings;
};

const collectStaticObjectKeys = (
  input: Expression,
  visited: Set<Node>,
): ReadonlySet<string> | undefined => {
  const expression = unwrapExpression(input);
  if (visited.has(expression)) return undefined;
  visited.add(expression);

  if (Node.isObjectLiteralExpression(expression)) {
    const keys = new Set<string>();
    for (const property of expression.getProperties()) {
      if (Node.isSpreadAssignment(property)) {
        const nestedKeys = collectStaticObjectKeys(
          property.getExpression(),
          visited,
        );
        if (nestedKeys === undefined) return undefined;
        for (const key of nestedKeys) keys.add(key);
        continue;
      }

      if (
        Node.isPropertyAssignment(property) ||
        Node.isShorthandPropertyAssignment(property) ||
        Node.isMethodDeclaration(property) ||
        Node.isGetAccessorDeclaration(property) ||
        Node.isSetAccessorDeclaration(property)
      ) {
        const name = getStaticName(property.getNameNode());
        if (name === undefined) return undefined;
        keys.add(name);
        continue;
      }

      return undefined;
    }
    return keys;
  }

  if (Node.isConditionalExpression(expression)) {
    const whenTrue = collectStaticObjectKeys(expression.getWhenTrue(), visited);
    const whenFalse = collectStaticObjectKeys(
      expression.getWhenFalse(),
      visited,
    );
    if (whenTrue === undefined || whenFalse === undefined) return undefined;
    return new Set([...whenTrue, ...whenFalse]);
  }

  if (Node.isIdentifier(expression)) {
    const declarations = expression.getSymbol()?.getDeclarations() ?? [];
    const declaration = declarations.find(Node.isVariableDeclaration);
    if (
      declaration === undefined ||
      declaration.getVariableStatement()?.getDeclarationKind() !==
        VariableDeclarationKind.Const
    ) {
      return undefined;
    }
    const declarationName = declaration.getNameNode();
    if (
      !Node.isIdentifier(declarationName) ||
      declarationName.findReferencesAsNodes().some((reference) => {
        const parent = reference.getParent();
        return (
          !Node.isJsxSpreadAttribute(parent) && !Node.isSpreadAssignment(parent)
        );
      })
    ) {
      return undefined;
    }
    const initializer = declaration.getInitializer();
    if (initializer === undefined) return undefined;
    return collectStaticObjectKeys(initializer, visited);
  }

  return undefined;
};

const hasMeaningfulChildren = (element: Node) => {
  if (!Node.isJsxElement(element)) return false;
  return element.getJsxChildren().some((child) => {
    if (Node.isJsxText(child)) return child.getText().trim().length > 0;
    if (Node.isJsxExpression(child)) {
      return child.getExpression() !== undefined;
    }
    return true;
  });
};

const collectUsageNames = ({
  sourceFiles,
  componentSource,
  componentName,
  repositoryRoot,
}: {
  readonly sourceFiles: ReadonlyArray<SourceFile>;
  readonly componentSource: SourceFile;
  readonly componentName: string;
  readonly repositoryRoot: string;
}) => {
  const names = new Set<string>();
  const unsupported: Array<UnsupportedCase> = [];

  for (const sourceFile of sourceFiles) {
    const localNames = getLocalComponentNames(
      sourceFile,
      componentSource,
      componentName,
    );
    if (localNames.size === 0) continue;

    const elements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];
    for (const element of elements) {
      if (!localNames.has(element.getTagNameNode().getText())) continue;

      for (const attribute of element.getAttributes()) {
        if (Node.isJsxAttribute(attribute)) {
          const name = attribute.getNameNode().getText();
          if (name !== "key") names.add(name);
          continue;
        }

        const spreadNames = collectStaticObjectKeys(
          attribute.getExpression(),
          new Set(),
        );
        if (spreadNames === undefined) {
          unsupported.push({
            kind: "usage",
            filePath: path.relative(repositoryRoot, sourceFile.getFilePath()),
            lineNumber: attribute.getStartLineNumber(),
            source: attribute.getText(),
            reason: { kind: "spread-props-not-static" },
          });
          continue;
        }
        for (const name of spreadNames) {
          if (name !== "key") names.add(name);
        }
      }

      if (
        Node.isJsxOpeningElement(element) &&
        hasMeaningfulChildren(element.getParent())
      ) {
        names.add("children");
      }
    }
  }

  return { names, unsupported };
};

const collectInternalNames = (componentFunction: ComponentFunction) => {
  const names = new Set<string>();
  const parameter = componentFunction.getParameters()[0];
  const nameNode = parameter?.getNameNode();
  if (nameNode === undefined) return { names, ambiguous: false };

  if (Node.isObjectBindingPattern(nameNode)) {
    const restBindings = collectBindingNames(nameNode.getElements(), names);
    const ambiguous = restBindings.some((binding) => {
      const restName = binding.getNameNode();
      return (
        !Node.isIdentifier(restName) || collectIdentifierNames(restName, names)
      );
    });
    return { names, ambiguous };
  }
  if (!Node.isIdentifier(nameNode)) return { names, ambiguous: true };

  return { names, ambiguous: collectIdentifierNames(nameNode, names) };
};

const collectIdentifierNames = (nameNode: Identifier, names: Set<string>) => {
  let ambiguous = false;
  for (const reference of nameNode.findReferencesAsNodes()) {
    const parent = reference.getParent();
    if (
      Node.isPropertyAccessExpression(parent) &&
      parent.getExpression() === reference
    ) {
      names.add(parent.getName());
      continue;
    }
    if (
      Node.isElementAccessExpression(parent) &&
      parent.getExpression() === reference
    ) {
      const name = getStaticName(parent.getArgumentExpression());
      if (name === undefined) ambiguous = true;
      else names.add(name);
      continue;
    }
    if (
      Node.isVariableDeclaration(parent) &&
      parent.getInitializer() === reference
    ) {
      const bindingName = parent.getNameNode();
      if (Node.isObjectBindingPattern(bindingName)) {
        const restBindings = collectBindingNames(
          bindingName.getElements(),
          names,
        );
        if (
          restBindings.some((binding) => {
            const restName = binding.getNameNode();
            return (
              !Node.isIdentifier(restName) ||
              collectIdentifierNames(restName, names)
            );
          })
        ) {
          ambiguous = true;
        }
        continue;
      }
    }
    if (
      (Node.isJsxSpreadAttribute(parent) || Node.isSpreadAssignment(parent)) &&
      parent.getExpression() === reference
    ) {
      continue;
    }
    ambiguous = true;
  }

  return ambiguous;
};

const renderKeys = (keys: ReadonlyArray<string>) =>
  keys.map((key) => JSON.stringify(key)).join(" | ");

const getAvailableKeys = (node: Node) =>
  new Set(
    node
      .getType()
      .getProperties()
      .map((property) => property.getName()),
  );

const getPickSourceTypeText = (node: TypeNode): string => {
  if (Node.isTypeReference(node)) {
    const utilityName = node.getTypeName().getText();
    const sourceType = node.getTypeArguments()[0];
    if (
      sourceType !== undefined &&
      (utilityName === "Pick" || utilityName === "Omit")
    ) {
      return getPickSourceTypeText(sourceType);
    }
  }
  return node.getText();
};

const getPickedTypeText = (node: TypeNode, usedNames: ReadonlySet<string>) => {
  const availableKeys = getAvailableKeys(node);
  const keys = [...usedNames].filter((name) => availableKeys.has(name)).sort();
  if (keys.length === 0) return undefined;
  return `Pick<${getPickSourceTypeText(node)}, ${renderKeys(keys)}>`;
};

const getNamedMemberName = (member: Node) => {
  if (Node.isPropertySignature(member) || Node.isMethodSignature(member)) {
    return getStaticName(member.getNameNode());
  }
  return undefined;
};

const hasUnsupportedMembers = (typeLiteral: TypeLiteralNode) =>
  typeLiteral
    .getMembers()
    .some(
      (member) =>
        !Node.isPropertySignature(member) && !Node.isMethodSignature(member),
    );

const isSupportedTypeNode = (typeNode: TypeNode): boolean => {
  if (Node.isUnionTypeNode(typeNode)) return false;
  if (Node.isTypeLiteral(typeNode)) return !hasUnsupportedMembers(typeNode);
  if (Node.isIntersectionTypeNode(typeNode)) {
    return typeNode.getTypeNodes().every(isSupportedTypeNode);
  }
  return true;
};

const getOriginalPropsSource = ({
  sourceFile,
  componentFunction,
  componentName,
  propsTypeName,
}: {
  readonly sourceFile: SourceFile;
  readonly componentFunction: ComponentFunction;
  readonly componentName: string;
  readonly propsTypeName: string;
}) => {
  const typeAlias = sourceFile.getTypeAlias(propsTypeName);
  if (typeAlias !== undefined) return typeAlias.getTypeNodeOrThrow();

  const interfaceDeclaration = sourceFile.getInterface(propsTypeName);
  if (interfaceDeclaration !== undefined) return interfaceDeclaration;

  const inlineType = componentFunction.getParameters()[0]?.getTypeNode();
  if (inlineType !== undefined && inlineType.getText() !== propsTypeName) {
    return inlineType;
  }

  const initializer = sourceFile
    .getVariableDeclaration(componentName)
    ?.getInitializer();
  return getForwardRefCall(initializer)?.getTypeArguments()[1];
};

const getUnsupportedPropsReason = (
  source: TypeNode | InterfaceDeclaration | undefined,
) => {
  if (source === undefined) return { kind: "props-type-not-resolved" } as const;
  if (Node.isInterfaceDeclaration(source)) {
    const supported = source
      .getMembers()
      .every(
        (member) =>
          Node.isPropertySignature(member) || Node.isMethodSignature(member),
      );
    return supported
      ? undefined
      : ({ kind: "props-interface-unsupported" } as const);
  }
  return isSupportedTypeNode(source)
    ? undefined
    : ({ kind: "props-type-unsupported" } as const);
};

const isWithinComponent = (
  node: Node,
  componentFunction: ComponentFunction,
  componentName: string,
) => {
  if (
    node.getFirstAncestor((ancestor) => ancestor === componentFunction) !==
    undefined
  ) {
    return true;
  }
  return (
    node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ===
    componentName
  );
};

const getSharedDeclarationReason = ({
  sourceFile,
  componentFunction,
  componentName,
  propsTypeName,
}: {
  readonly sourceFile: SourceFile;
  readonly componentFunction: ComponentFunction;
  readonly componentName: string;
  readonly propsTypeName: string;
}) => {
  const declaration =
    sourceFile.getTypeAlias(propsTypeName) ??
    sourceFile.getInterface(propsTypeName);
  if (declaration === undefined) return undefined;

  const references = declaration.getNameNode().findReferencesAsNodes();
  const componentReferences = references.filter((reference) =>
    isWithinComponent(reference, componentFunction, componentName),
  );
  if (componentReferences.length === 0) {
    return { kind: "props-type-not-component", propsTypeName } as const;
  }
  if (componentReferences.length !== references.length) {
    return {
      kind: "props-type-shared",
      propsTypeName,
      componentName,
    } as const;
  }
  return undefined;
};

const getComponentEscapeReason = (
  sourceFile: SourceFile,
  componentName: string,
) => {
  const declaration =
    sourceFile.getFunction(componentName) ??
    sourceFile.getVariableDeclaration(componentName);
  const nameNode = declaration?.getNameNode();
  if (nameNode === undefined || !Node.isIdentifier(nameNode)) return undefined;

  const unsupportedReference = nameNode
    .findReferencesAsNodes()
    .find((reference) => {
      const jsxElement = reference.getFirstAncestor(
        (ancestor) =>
          Node.isJsxOpeningElement(ancestor) ||
          Node.isJsxSelfClosingElement(ancestor) ||
          Node.isJsxClosingElement(ancestor),
      );
      if (jsxElement !== undefined) return false;

      const parent = reference.getParent();
      if (
        Node.isImportSpecifier(parent) ||
        Node.isImportClause(parent) ||
        Node.isExportSpecifier(parent) ||
        Node.isExportAssignment(parent)
      ) {
        return false;
      }
      if (
        Node.isPropertyAccessExpression(parent) &&
        parent.getExpression() === reference &&
        parent.getName() === "displayName"
      ) {
        return false;
      }
      return true;
    });

  return unsupportedReference === undefined
    ? undefined
    : ({
        kind: "component-unsupported-reference",
        componentName,
      } as const);
};

const removeUnusedMembers = (
  typeLiteral: TypeLiteralNode,
  usedNames: ReadonlySet<string>,
) => {
  for (const member of [...typeLiteral.getMembers()].reverse()) {
    const name = getNamedMemberName(member);
    if (name !== undefined && !usedNames.has(name)) member.remove();
  }
};

const getExplicitNames = (typeLiterals: ReadonlyArray<TypeLiteralNode>) =>
  new Set(
    typeLiterals.flatMap((typeLiteral) =>
      typeLiteral
        .getMembers()
        .map(getNamedMemberName)
        .filter((name): name is string => name !== undefined),
    ),
  );

const narrowTypeAlias = (
  declaration: TypeAliasDeclaration,
  usedNames: ReadonlySet<string>,
) => {
  const typeNode = declaration.getTypeNodeOrThrow();
  if (Node.isUnionTypeNode(typeNode)) return false;

  const parts = Node.isIntersectionTypeNode(typeNode)
    ? typeNode.getTypeNodes()
    : [typeNode];
  const typeLiterals = parts.filter((part): part is TypeLiteralNode =>
    Node.isTypeLiteral(part),
  );
  if (typeLiterals.some(hasUnsupportedMembers)) return false;

  const explicitNames = getExplicitNames(typeLiterals);
  const inheritedNames = new Set(
    [...usedNames].filter((name) => !explicitNames.has(name)),
  );
  const before = typeNode.getText();
  for (const typeLiteral of typeLiterals) {
    removeUnusedMembers(typeLiteral, usedNames);
  }

  const nextParts = parts.flatMap((part) => {
    if (Node.isTypeLiteral(part)) return [part.getText()];
    const pickedType = getPickedTypeText(part, inheritedNames);
    return pickedType === undefined ? [] : [pickedType];
  });
  const nextType = nextParts.join(" & ") || "{}";
  if (nextType !== typeNode.getText()) declaration.setType(nextType);
  return before !== declaration.getTypeNodeOrThrow().getText();
};

const getPickedHeritageText = (
  heritage: ExpressionWithTypeArguments,
  usedNames: ReadonlySet<string>,
) => {
  const availableKeys = getAvailableKeys(heritage);
  const keys = [...usedNames].filter((name) => availableKeys.has(name)).sort();
  if (keys.length === 0) return undefined;
  const expression = heritage.getExpression().getText();
  const typeArguments = heritage.getTypeArguments();
  const sourceType = typeArguments[0];
  if (
    sourceType !== undefined &&
    (expression === "Pick" || expression === "Omit")
  ) {
    return `Pick<${getPickSourceTypeText(sourceType)}, ${renderKeys(keys)}>`;
  }
  return `Pick<${heritage.getText()}, ${renderKeys(keys)}>`;
};

const narrowInterface = (
  declaration: InterfaceDeclaration,
  usedNames: ReadonlySet<string>,
) => {
  if (
    declaration
      .getMembers()
      .some(
        (member) =>
          !Node.isPropertySignature(member) && !Node.isMethodSignature(member),
      )
  ) {
    return false;
  }

  const explicitNames = new Set(
    declaration
      .getMembers()
      .map(getNamedMemberName)
      .filter((name): name is string => name !== undefined),
  );
  const inheritedNames = new Set(
    [...usedNames].filter((name) => !explicitNames.has(name)),
  );
  const before = declaration.getText();
  for (const member of [...declaration.getMembers()].reverse()) {
    const name = getNamedMemberName(member);
    if (name !== undefined && !usedNames.has(name)) member.remove();
  }
  for (const heritage of [...declaration.getExtends()].reverse()) {
    const pickedHeritage = getPickedHeritageText(heritage, inheritedNames);
    if (pickedHeritage === undefined) {
      declaration.removeExtends(heritage);
    } else {
      heritage.replaceWithText(pickedHeritage);
    }
  }
  return before !== declaration.getText();
};

const prepareNarrowing = (options: NarrowPropsOptions) =>
  Effect.gen(function* () {
    const { componentSource, sourceFiles } =
      yield* loadPropActionProject(options);
    const prepared = yield* Effect.try({
      try: () => {
        const componentFunction = getComponentFunction(
          componentSource,
          options.componentName,
        );
        if (componentFunction === undefined) {
          throw new UnsupportedComponentDeclarationError({
            componentName: options.componentName,
          });
        }

        const usages = collectUsageNames({
          sourceFiles,
          componentSource,
          componentName: options.componentName,
          repositoryRoot: options.repositoryRoot,
        });
        const internal = collectInternalNames(componentFunction);
        const unsupported = [...usages.unsupported];
        const usedNames = new Set([...usages.names, ...internal.names]);
        if (internal.ambiguous) {
          unsupported.push({
            kind: "component",
            filePath: path.relative(
              options.repositoryRoot,
              componentSource.getFilePath(),
            ),
            reason: { kind: "component-props-not-static" },
          });
        }
        const propsReason = getUnsupportedPropsReason(
          getOriginalPropsSource({
            sourceFile: componentSource,
            componentFunction,
            componentName: options.componentName,
            propsTypeName: options.propsTypeName,
          }),
        );
        if (propsReason !== undefined) {
          unsupported.push({
            kind: "component",
            filePath: path.relative(
              options.repositoryRoot,
              componentSource.getFilePath(),
            ),
            reason: propsReason,
          });
        }
        const sharedReason = getSharedDeclarationReason({
          sourceFile: componentSource,
          componentFunction,
          componentName: options.componentName,
          propsTypeName: options.propsTypeName,
        });
        if (sharedReason !== undefined) {
          unsupported.push({
            kind: "component",
            filePath: path.relative(
              options.repositoryRoot,
              componentSource.getFilePath(),
            ),
            reason: sharedReason,
          });
        }
        const componentEscapeReason = getComponentEscapeReason(
          componentSource,
          options.componentName,
        );
        if (componentEscapeReason !== undefined) {
          unsupported.push({
            kind: "component",
            filePath: path.relative(
              options.repositoryRoot,
              componentSource.getFilePath(),
            ),
            reason: componentEscapeReason,
          });
        }
        if (unsupported.length > 0) {
          return {
            collectChangedFiles: false as const,
            unsupported,
            usedProps: [...usedNames].sort(),
          };
        }

        const declaration = getOrExtractPropsDeclaration({
          sourceFile: componentSource,
          componentFunction,
          componentName: options.componentName,
          propsTypeName: options.propsTypeName,
        });
        const narrowed = Node.isTypeAliasDeclaration(declaration)
          ? narrowTypeAlias(declaration, usedNames)
          : narrowInterface(declaration, usedNames);
        const emptyPropsCleanup = removeEmptyPropsDeclaration({
          declaration,
          componentFunction,
          componentName: options.componentName,
        });
        if (emptyPropsCleanup === "unsupported") {
          unsupported.push({
            kind: "component",
            filePath: path.relative(
              options.repositoryRoot,
              componentSource.getFilePath(),
            ),
            reason: { kind: "empty-props-cleanup-unsupported" },
          });
          return {
            collectChangedFiles: false as const,
            unsupported,
            usedProps: [...usedNames].sort(),
          };
        }

        if (
          narrowed ||
          emptyPropsCleanup === "removed" ||
          !componentSource.isSaved()
        ) {
          componentSource.formatText({ indentSize: 2 });
        }
        return {
          collectChangedFiles: true as const,
          unsupported,
          usedProps: [...usedNames].sort(),
          yes: options.yes,
        };
      },
      catch: preserveSweepyError,
    });
    const changedFiles = prepared.collectChangedFiles
      ? yield* getChangedFiles(options.repositoryRoot)
      : [];
    return {
      changedFiles,
      unsupported: prepared.unsupported,
      usedProps: prepared.usedProps,
    };
  });

export const narrowProps = (options: NarrowPropsOptions) =>
  Effect.gen(function* () {
    const { changedFiles, unsupported, usedProps } =
      yield* prepareNarrowing(options);

    if (unsupported.length > 0) {
      yield* Console.log(
        `Could not safely narrow props:\n${formatUnsupportedCases(unsupported)}`,
      );
    }
    if (changedFiles.length === 0) {
      yield* Console.log("No changes.");
      return { changedFiles, unsupported, usedProps };
    }

    yield* Console.log(`Used props: ${usedProps.join(", ") || "none"}`);
    const saved = yield* executeChanges({
      changedFiles,
      repositoryRoot: options.repositoryRoot,
      yes: options.yes,
      dryRun: options.dryRun,
    });
    return {
      changedFiles: saved ? changedFiles : [],
      unsupported,
      usedProps,
    };
  });
