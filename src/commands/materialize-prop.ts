import path from "node:path";

import { Console, Effect } from "effect";
import {
  type Expression,
  type JsxAttribute,
  Node,
  Project,
  type PropertySignature,
  type SourceFile,
  SyntaxKind,
  type TypeAliasDeclaration,
  type TypeLiteralNode,
  VariableDeclarationKind,
} from "ts-morph";

import {
  AmbiguousComponentError,
  ComponentFileNotFoundError,
  ComponentNotFoundError,
  ComponentNotFoundInFileError,
  InvalidClassNameFragmentsError,
  NoSourceFilesError,
  NoSupportedPropValuesError,
  preserveSweepyError,
  PropNotFoundError,
} from "../errors";
import { executeChanges } from "../execute-changes";
import {
  type ComponentFunction,
  getComponentFunction,
  getLocalComponentNames,
  getOrExtractPropsDeclaration,
} from "../prop-action";
import {
  formatUnsupportedCases,
  type UnsupportedCase,
} from "../unsupported-case";

type MaterializedValue = string | number;
type FiniteValue = MaterializedValue | undefined;

type FiniteExpression =
  | { readonly kind: "value"; readonly value: FiniteValue }
  | {
      readonly kind: "conditional";
      readonly condition: string;
      readonly whenTrue: FiniteExpression;
      readonly whenFalse: FiniteExpression;
    };

type MaterializePropOptions = {
  readonly repositoryRoot: string;
  readonly componentName: string;
  readonly propsTypeName: string;
  readonly searchRoot: string;
  readonly tsconfigPath: string;
  readonly componentFile: string | undefined;
  readonly propName: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
};

const value = (literal: FiniteValue): FiniteExpression => ({
  kind: "value",
  value: literal,
});

const mapValues = (
  expression: FiniteExpression,
  transform: (literal: FiniteValue) => FiniteValue,
): FiniteExpression => {
  if (expression.kind === "value") {
    return value(transform(expression.value));
  }

  return {
    ...expression,
    whenTrue: mapValues(expression.whenTrue, transform),
    whenFalse: mapValues(expression.whenFalse, transform),
  };
};

const combineStrings = (
  left: FiniteExpression,
  right: FiniteExpression,
): FiniteExpression => {
  if (left.kind === "conditional") {
    return {
      ...left,
      whenTrue: combineStrings(left.whenTrue, right),
      whenFalse: combineStrings(left.whenFalse, right),
    };
  }

  if (right.kind === "conditional") {
    return {
      ...right,
      whenTrue: combineStrings(left, right.whenTrue),
      whenFalse: combineStrings(left, right.whenFalse),
    };
  }

  if (typeof left.value !== "string" || typeof right.value !== "string") {
    throw new InvalidClassNameFragmentsError({
      left: left.value,
      right: right.value,
    });
  }

  return value(left.value + right.value);
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

const getSymbolDeclarations = (node: Node) => {
  let symbol = node.getSymbol();
  const visited = new Set<NonNullable<typeof symbol>>();
  while (symbol !== undefined && !visited.has(symbol)) {
    visited.add(symbol);
    const aliasedSymbol = symbol.getAliasedSymbol();
    if (aliasedSymbol === undefined) return symbol.getDeclarations();
    symbol = aliasedSymbol;
  }
  return [];
};

const analyzeLiteralType = (input: Expression, isClassName: boolean) => {
  const type = input.getType();
  const literal = type.getLiteralValue();
  if (type.isStringLiteral() && typeof literal === "string") {
    return value(literal);
  }
  if (type.isNumberLiteral() && !isClassName && typeof literal === "number") {
    return value(literal);
  }
  if (type.isUndefined()) return value(undefined);
  return undefined;
};

const isPropertyWrite = (expression: Expression) => {
  const parent = expression.getParent();
  if (Node.isBinaryExpression(parent) && parent.getLeft() === expression) {
    return true;
  }
  return (
    Node.isPrefixUnaryExpression(parent) ||
    Node.isPostfixUnaryExpression(parent) ||
    Node.isDeleteExpression(parent)
  );
};

const analyzeExpressionInternal = (
  input: Expression,
  isClassName: boolean,
  visiting: Set<Node>,
  constAssertions: Map<Node, Expression>,
): FiniteExpression | undefined => {
  const expression = unwrapExpression(input);

  if (
    Node.isStringLiteral(expression) ||
    Node.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return value(expression.getLiteralValue());
  }

  if (Node.isNumericLiteral(expression) && !isClassName) {
    return value(expression.getLiteralValue());
  }

  const literalType = analyzeLiteralType(expression, isClassName);
  if (literalType !== undefined) return literalType;

  if (Node.isConditionalExpression(expression)) {
    const whenTrue = analyzeExpressionInternal(
      expression.getWhenTrue(),
      isClassName,
      visiting,
      constAssertions,
    );
    const whenFalse = analyzeExpressionInternal(
      expression.getWhenFalse(),
      isClassName,
      visiting,
      constAssertions,
    );
    if (whenTrue === undefined || whenFalse === undefined) return undefined;

    return {
      kind: "conditional",
      condition: expression.getCondition().getText(),
      whenTrue,
      whenFalse,
    };
  }

  if (
    isClassName &&
    Node.isBinaryExpression(expression) &&
    expression.getOperatorToken().getKind() ===
      SyntaxKind.AmpersandAmpersandToken
  ) {
    const whenTrue = analyzeExpressionInternal(
      expression.getRight(),
      true,
      visiting,
      constAssertions,
    );
    if (whenTrue === undefined) return undefined;

    return {
      kind: "conditional",
      condition: expression.getLeft().getText(),
      whenTrue,
      whenFalse: value(""),
    };
  }

  if (isClassName && Node.isTemplateExpression(expression)) {
    let result: FiniteExpression = value(expression.getHead().getLiteralText());

    for (const span of expression.getTemplateSpans()) {
      const spanExpression = analyzeExpressionInternal(
        span.getExpression(),
        true,
        visiting,
        constAssertions,
      );
      if (spanExpression === undefined) return undefined;
      result = combineStrings(result, spanExpression);
      result = combineStrings(
        result,
        value(span.getLiteral().getLiteralText()),
      );
    }

    return mapValues(result, (literal) => {
      if (typeof literal !== "string") return literal;
      return literal.trim().split(/\s+/u).filter(Boolean).join(" ");
    });
  }

  if (Node.isIdentifier(expression)) {
    const declarations = getSymbolDeclarations(expression);
    if (declarations.length !== 1) return undefined;
    const declaration = declarations[0]!;
    if (!Node.isVariableDeclaration(declaration)) return undefined;
    if (
      declaration.getVariableStatement()?.getDeclarationKind() !==
      VariableDeclarationKind.Const
    ) {
      return undefined;
    }
    const initializer = declaration.getInitializer();
    if (initializer === undefined || visiting.has(declaration))
      return undefined;

    visiting.add(declaration);
    const analyzed = analyzeExpressionInternal(
      initializer,
      isClassName,
      visiting,
      constAssertions,
    );
    visiting.delete(declaration);
    return analyzed;
  }

  if (Node.isCallExpression(expression)) {
    if (expression.getArguments().length !== 0) return undefined;
    const callee = expression.getExpression();
    if (!Node.isIdentifier(callee)) return undefined;
    const declarations = getSymbolDeclarations(callee);
    if (declarations.length !== 1) return undefined;
    const declaration = declarations[0]!;
    if (!Node.isFunctionDeclaration(declaration)) return undefined;
    if (
      declaration.getParameters().length !== 0 ||
      declaration.getReturnTypeNode() !== undefined ||
      visiting.has(declaration)
    ) {
      return undefined;
    }
    const body = declaration.getBody();
    if (body === undefined || !Node.isBlock(body)) return undefined;
    const statements = body.getStatements();
    if (statements.length !== 1 || !Node.isReturnStatement(statements[0])) {
      return undefined;
    }
    const returnExpression = statements[0].getExpression();
    if (returnExpression === undefined) return undefined;
    const isPrimitiveLiteral =
      Node.isStringLiteral(returnExpression) ||
      Node.isNoSubstitutionTemplateLiteral(returnExpression) ||
      (!isClassName && Node.isNumericLiteral(returnExpression));
    if (!isPrimitiveLiteral) return undefined;

    const literal = returnExpression.getLiteralValue();
    visiting.add(declaration);
    constAssertions.set(declaration, returnExpression);
    visiting.delete(declaration);
    return value(literal);
  }

  if (Node.isPropertyAccessExpression(expression)) {
    const base = expression.getExpression();
    if (!Node.isIdentifier(base)) return undefined;
    const baseDeclarations = getSymbolDeclarations(base);
    if (baseDeclarations.length !== 1) return undefined;
    const variableDeclaration = baseDeclarations[0]!;
    if (!Node.isVariableDeclaration(variableDeclaration)) return undefined;
    const variableStatement = variableDeclaration.getVariableStatement();
    if (
      variableStatement?.getDeclarationKind() !==
        VariableDeclarationKind.Const ||
      variableStatement.isExported()
    ) {
      return undefined;
    }
    const initializer = variableDeclaration.getInitializer();
    if (initializer === undefined) return undefined;
    const objectLiteral = unwrapExpression(initializer);
    if (!Node.isObjectLiteralExpression(objectLiteral)) return undefined;

    const nameNode = variableDeclaration.getNameNode();
    if (!Node.isIdentifier(nameNode)) return undefined;
    const references = nameNode.findReferencesAsNodes();
    const safelyRead = references.every((reference) => {
      const parent = reference.getParent();
      return (
        Node.isPropertyAccessExpression(parent) &&
        parent.getExpression() === reference &&
        !isPropertyWrite(parent)
      );
    });
    if (!safelyRead) return undefined;

    const propertyDeclarations = getSymbolDeclarations(
      expression.getNameNode(),
    );
    if (propertyDeclarations.length !== 1) return undefined;
    const propertyDeclaration = propertyDeclarations[0]!;
    if (!Node.isPropertyAssignment(propertyDeclaration)) return undefined;
    if (propertyDeclaration.getParent() !== objectLiteral) return undefined;
    if (visiting.has(propertyDeclaration)) return undefined;

    visiting.add(propertyDeclaration);
    const propertyInitializer = propertyDeclaration.getInitializer();
    if (propertyInitializer === undefined) return undefined;
    const analyzed = analyzeExpressionInternal(
      propertyInitializer,
      isClassName,
      visiting,
      constAssertions,
    );
    visiting.delete(propertyDeclaration);
    return analyzed;
  }

  return undefined;
};

const analyzeExpression = (input: Expression, isClassName: boolean) => {
  const constAssertions = new Map<Node, Expression>();
  const analyzed = analyzeExpressionInternal(
    input,
    isClassName,
    new Set(),
    constAssertions,
  );
  if (analyzed === undefined) return undefined;

  for (const returnExpression of constAssertions.values()) {
    returnExpression.replaceWithText(`${returnExpression.getText()} as const`);
  }
  return analyzed;
};

const collectValues = (
  expression: FiniteExpression,
  values: Map<string, MaterializedValue>,
) => {
  if (expression.kind === "value") {
    if (expression.value === undefined) return;
    values.set(
      `${typeof expression.value}:${expression.value}`,
      expression.value,
    );
    return;
  }

  collectValues(expression.whenTrue, values);
  collectValues(expression.whenFalse, values);
};

const renderExpression = (expression: FiniteExpression): string => {
  if (expression.kind === "value") {
    if (expression.value === undefined) return "undefined";
    return typeof expression.value === "string"
      ? JSON.stringify(expression.value)
      : String(expression.value);
  }

  return `${expression.condition} ? ${renderExpression(expression.whenTrue)} : ${renderExpression(expression.whenFalse)}`;
};

const findComponent = (
  sourceFiles: ReadonlyArray<SourceFile>,
  componentName: string,
  explicitPath: string | undefined,
  searchRoot: string,
) => {
  if (explicitPath !== undefined) {
    const sourceFile = sourceFiles.find(
      (candidate) => path.resolve(candidate.getFilePath()) === explicitPath,
    );
    if (sourceFile === undefined) {
      throw new ComponentFileNotFoundError({
        filePath: explicitPath,
      });
    }

    const componentFunction = getComponentFunction(sourceFile, componentName);
    if (componentFunction === undefined) {
      throw new ComponentNotFoundInFileError({
        componentName,
        filePath: sourceFile.getFilePath(),
      });
    }
    return { sourceFile, componentFunction };
  }

  const matches = sourceFiles.flatMap((sourceFile) => {
    const componentFunction = getComponentFunction(sourceFile, componentName);
    return componentFunction === undefined
      ? []
      : [{ sourceFile, componentFunction }];
  });

  if (matches.length === 0) {
    throw new ComponentNotFoundError({
      componentName,
      searchRoot,
    });
  }
  if (matches.length > 1) {
    throw new AmbiguousComponentError({ componentName });
  }

  return matches[0]!;
};

const setPropertyType = (property: PropertySignature, type: string) => {
  if (property.getTypeNode()?.getText() !== type) {
    property.setType(type);
  }
};

const ensurePropOnTypeLiteral = (
  typeLiteral: TypeLiteralNode,
  propName: string,
  type: string,
) => {
  const property = typeLiteral.getProperty(propName);
  if (property !== undefined) {
    setPropertyType(property, type);
    property.setHasQuestionToken(true);
    return;
  }

  typeLiteral.insertProperty(0, {
    name: propName,
    hasQuestionToken: true,
    type,
  });
};

const shouldOmitInheritedProp = (type: string) =>
  type.includes("HTMLAttributes") ||
  type.includes("ComponentProps") ||
  type.includes("ComponentPropsWithoutRef") ||
  type.includes("ComponentPropsWithRef");

const omitLooseProp = (type: string, propName: string) => {
  if (type.startsWith("Omit<") || !shouldOmitInheritedProp(type)) return type;
  return `Omit<${type}, ${JSON.stringify(propName)}>`;
};

const ensurePropOnTypeAlias = (
  typeAlias: TypeAliasDeclaration,
  propName: string,
  type: string,
) => {
  const typeNode = typeAlias.getTypeNodeOrThrow();
  if (Node.isTypeLiteral(typeNode)) {
    ensurePropOnTypeLiteral(typeNode, propName, type);
    return;
  }

  if (Node.isIntersectionTypeNode(typeNode)) {
    const typeLiteral = typeNode
      .getTypeNodes()
      .find((candidate): candidate is TypeLiteralNode =>
        Node.isTypeLiteral(candidate),
      );
    if (typeLiteral !== undefined) {
      ensurePropOnTypeLiteral(typeLiteral, propName, type);
      for (const inheritedType of typeNode.getTypeNodes()) {
        if (Node.isTypeLiteral(inheritedType)) continue;
        const inheritedTypeText = inheritedType.getText();
        const narrowedType = omitLooseProp(inheritedTypeText, propName);
        if (narrowedType !== inheritedTypeText) {
          inheritedType.replaceWithText(narrowedType);
        }
      }
      return;
    }
  }

  typeAlias.setType(
    `${omitLooseProp(typeNode.getText(), propName)} & { ${propName}?: ${type} }`,
  );
};

const rewritePropType = ({
  sourceFile,
  componentFunction,
  componentName,
  propsTypeName,
  propName,
  type,
}: {
  readonly sourceFile: SourceFile;
  readonly componentFunction: ComponentFunction;
  readonly componentName: string;
  readonly propsTypeName: string;
  readonly propName: string;
  readonly type: string;
}) => {
  const declaration = getOrExtractPropsDeclaration({
    sourceFile,
    componentFunction,
    componentName,
    propsTypeName,
  });
  if (Node.isInterfaceDeclaration(declaration)) {
    const property = declaration.getProperty(propName);
    if (property === undefined) {
      throw new PropNotFoundError({ propName, propsTypeName });
    }
    setPropertyType(property, type);
    return;
  }

  ensurePropOnTypeAlias(declaration, propName, type);
};

const getAttributeExpression = (attribute: JsxAttribute) => {
  const initializer = attribute.getInitializer();
  if (initializer === undefined) return undefined;

  if (Node.isStringLiteral(initializer)) {
    return value(initializer.getLiteralValue());
  }
  if (!Node.isJsxExpression(initializer)) return undefined;

  const expression = initializer.getExpression();
  if (expression === undefined) return undefined;
  return expression;
};

const prepareMaterialization = ({
  repositoryRoot,
  componentName,
  propsTypeName,
  searchRoot,
  tsconfigPath,
  componentFile,
  propName,
}: MaterializePropOptions) => {
  const absoluteTsconfig = path.resolve(repositoryRoot, tsconfigPath);
  const absoluteSearchRoot = path.resolve(repositoryRoot, searchRoot);
  const project = new Project({
    tsConfigFilePath: absoluteTsconfig,
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths([
    path.join(absoluteSearchRoot, "**/*.ts"),
    path.join(absoluteSearchRoot, "**/*.tsx"),
  ]);

  const absoluteComponentFile =
    componentFile === undefined
      ? undefined
      : path.resolve(repositoryRoot, componentFile);
  if (absoluteComponentFile !== undefined) {
    project.addSourceFileAtPathIfExists(absoluteComponentFile);
  }

  const sourceFiles = project.getSourceFiles();
  if (sourceFiles.length === 0) {
    throw new NoSourceFilesError({ searchRoot });
  }

  const { sourceFile: componentSource, componentFunction } = findComponent(
    sourceFiles,
    componentName,
    absoluteComponentFile,
    searchRoot,
  );

  const isClassName = propName === "className";
  const discoveredValues = new Map<string, MaterializedValue>();
  const unsupported: Array<UnsupportedCase> = [];

  const firstParameter = componentFunction.getParameters()[0];
  const bindingPattern = firstParameter?.getNameNode();
  if (
    bindingPattern !== undefined &&
    Node.isObjectBindingPattern(bindingPattern)
  ) {
    const binding = bindingPattern
      .getElements()
      .find((element) => element.getName() === propName);
    const initializer = binding?.getInitializer();
    if (initializer !== undefined) {
      const analyzed = analyzeExpression(initializer, isClassName);
      if (analyzed !== undefined) collectValues(analyzed, discoveredValues);
    }
  }

  for (const sourceFile of sourceFiles) {
    const localComponentNames = getLocalComponentNames(
      sourceFile,
      componentSource,
      componentName,
    );
    if (localComponentNames.size === 0) continue;

    const openingElements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];

    for (const element of openingElements) {
      if (!localComponentNames.has(element.getTagNameNode().getText()))
        continue;
      const attribute = element
        .getAttributes()
        .find(
          (candidate): candidate is JsxAttribute =>
            Node.isJsxAttribute(candidate) &&
            candidate.getNameNode().getText() === propName,
        );
      if (attribute === undefined) continue;

      const expression = getAttributeExpression(attribute);
      if (expression === undefined) {
        unsupported.push({
          kind: "usage",
          filePath: path.relative(repositoryRoot, sourceFile.getFilePath()),
          lineNumber: attribute.getStartLineNumber(),
          source: attribute.getText(),
          reason: { kind: "prop-value-not-static" },
        });
        continue;
      }

      if ("kind" in expression) {
        collectValues(expression, discoveredValues);
        continue;
      }

      const analyzed = analyzeExpression(expression, isClassName);
      if (analyzed === undefined) {
        unsupported.push({
          kind: "usage",
          filePath: path.relative(repositoryRoot, sourceFile.getFilePath()),
          lineNumber: attribute.getStartLineNumber(),
          source: attribute.getText(),
          reason: { kind: "prop-value-not-static" },
        });
        continue;
      }

      collectValues(analyzed, discoveredValues);
      if (
        analyzed.kind === "conditional" ||
        Node.isTemplateExpression(expression) ||
        Node.isBinaryExpression(expression)
      ) {
        const rendered = renderExpression(analyzed);
        if (expression.getText() !== rendered) {
          attribute.setInitializer(`{${rendered}}`);
        }
      }
    }
  }

  const values = [...discoveredValues.values()];
  if (values.length === 0) {
    throw new NoSupportedPropValuesError({
      componentName,
      propName,
      unsupported,
    });
  }

  const materializedType = values
    .map((literal) => JSON.stringify(literal))
    .join(" | ");
  rewritePropType({
    sourceFile: componentSource,
    componentFunction,
    componentName,
    propsTypeName,
    propName,
    type: materializedType,
  });

  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.isSaved()) continue;
    sourceFile.formatText({ indentSize: 2 });
  }

  const changedFiles = project
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isSaved())
    .map((sourceFile) =>
      path.relative(repositoryRoot, sourceFile.getFilePath()),
    );

  return { project, changedFiles, unsupported };
};

export const materializeProp = (options: MaterializePropOptions) =>
  Effect.gen(function* () {
    const { changedFiles, project, unsupported } = yield* Effect.try({
      try: () => prepareMaterialization(options),
      catch: preserveSweepyError,
    });

    if (unsupported.length > 0) {
      yield* Console.log(
        `Unsupported usages left unchanged:\n${formatUnsupportedCases(unsupported)}`,
      );
    }

    if (changedFiles.length === 0) {
      yield* Console.log("No changes.");
      return { changedFiles, unsupported };
    }

    const saved = yield* executeChanges({
      project,
      changedFiles,
      repositoryRoot: options.repositoryRoot,
      yes: options.yes,
      dryRun: options.dryRun,
    });
    return { changedFiles: saved ? changedFiles : [], unsupported };
  });
