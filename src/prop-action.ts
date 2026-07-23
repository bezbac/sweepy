import path from "node:path";

import {
  type ArrowFunction,
  type CallExpression,
  type Expression,
  type FunctionDeclaration,
  type FunctionExpression,
  type InterfaceDeclaration,
  type JsxAttribute,
  Node,
  Project,
  type PropertySignature,
  type Symbol as MorphSymbol,
  type SourceFile,
  type TypeAliasDeclaration,
  type TypeLiteralNode,
} from "ts-morph";

import {
  AmbiguousComponentError,
  ComponentFileNotFoundError,
  ComponentNotFoundError,
  ComponentNotFoundInFileError,
  NoSourceFilesError,
  PropsExtractionFailedError,
  PropsTypeNotFoundError,
  PropValueNotFoundError,
} from "./errors";

export type PropValue = string | number;

export type ComponentFunction =
  | FunctionDeclaration
  | ArrowFunction
  | FunctionExpression;

export type PropsDeclaration = TypeAliasDeclaration | InterfaceDeclaration;

export type PropActionOptions = {
  readonly repositoryRoot: string;
  readonly componentName: string;
  readonly propsTypeName: string;
  readonly searchRoot: string;
  readonly tsconfigPath: string;
  readonly componentFile: string | undefined;
};

export const renderValue = (value: PropValue) =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

export const renderInitializer = (value: PropValue) =>
  typeof value === "string" ? JSON.stringify(value) : `{${value}}`;

export const getStrictPropValues = (property: PropertySignature) => {
  const typeNode = property.getTypeNode();
  if (typeNode === undefined) return undefined;

  const typeNodes = Node.isUnionTypeNode(typeNode)
    ? typeNode.getTypeNodes()
    : [typeNode];
  const values: Array<PropValue> = [];

  for (const candidate of typeNodes) {
    if (!Node.isLiteralTypeNode(candidate)) return undefined;
    const literal = candidate.getLiteral();
    if (Node.isStringLiteral(literal)) {
      values.push(literal.getLiteralValue());
      continue;
    }
    if (Node.isNumericLiteral(literal)) {
      values.push(literal.getLiteralValue());
      continue;
    }
    return undefined;
  }

  return values;
};

export const selectValue = (
  input: string,
  values: ReadonlyArray<PropValue>,
  propName: string,
) => {
  const exact = values.filter((value) => renderValue(value) === input);
  if (exact.length === 1) return exact[0]!;

  const unquoted = values.filter(
    (value) => typeof value === "string" && value === input,
  );
  if (unquoted.length === 1) return unquoted[0]!;

  throw new PropValueNotFoundError({
    input,
    propName,
    allowedValues: values,
  });
};

const getPropsProperties = (sourceFile: SourceFile, propsTypeName: string) => {
  const interfaceDeclaration = sourceFile.getInterface(propsTypeName);
  if (interfaceDeclaration !== undefined) {
    return interfaceDeclaration.getProperties();
  }

  const typeNode = sourceFile.getTypeAlias(propsTypeName)?.getTypeNode();
  if (typeNode !== undefined && Node.isTypeLiteral(typeNode)) {
    return typeNode.getProperties();
  }
  if (typeNode !== undefined && Node.isIntersectionTypeNode(typeNode)) {
    return typeNode
      .getTypeNodes()
      .filter((candidate): candidate is TypeLiteralNode =>
        Node.isTypeLiteral(candidate),
      )
      .flatMap((candidate) => candidate.getProperties());
  }

  return [];
};

const hasComponent = (sourceFile: SourceFile, componentName: string) =>
  sourceFile.getFunction(componentName) !== undefined ||
  sourceFile.getVariableDeclaration(componentName) !== undefined ||
  sourceFile.getClass(componentName) !== undefined;

const findComponentSource = (
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
    if (!hasComponent(sourceFile, componentName)) {
      throw new ComponentNotFoundInFileError({
        componentName,
        filePath: sourceFile.getFilePath(),
      });
    }
    return sourceFile;
  }

  const matches = sourceFiles.filter((sourceFile) =>
    hasComponent(sourceFile, componentName),
  );
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

export const loadPropActionProject = (options: PropActionOptions) => {
  const project = new Project({
    tsConfigFilePath: path.resolve(
      options.repositoryRoot,
      options.tsconfigPath,
    ),
    skipAddingFilesFromTsConfig: true,
  });
  const absoluteSearchRoot = path.resolve(
    options.repositoryRoot,
    options.searchRoot,
  );
  project.addSourceFilesAtPaths([
    path.join(absoluteSearchRoot, "**/*.ts"),
    path.join(absoluteSearchRoot, "**/*.tsx"),
  ]);

  const absoluteComponentFile =
    options.componentFile === undefined
      ? undefined
      : path.resolve(options.repositoryRoot, options.componentFile);
  if (absoluteComponentFile !== undefined) {
    project.addSourceFileAtPathIfExists(absoluteComponentFile);
  }

  const sourceFiles = project.getSourceFiles();
  if (sourceFiles.length === 0) {
    throw new NoSourceFilesError({
      searchRoot: options.searchRoot,
    });
  }
  const componentSource = findComponentSource(
    sourceFiles,
    options.componentName,
    absoluteComponentFile,
    options.searchRoot,
  );

  return {
    componentSource,
    project,
    properties: getPropsProperties(componentSource, options.propsTypeName),
    sourceFiles,
  };
};

export const getLocalComponentNames = (
  sourceFile: SourceFile,
  componentSource: SourceFile,
  componentName: string,
) => {
  const names = new Set<string>();
  if (sourceFile === componentSource) names.add(componentName);

  const componentBaseName = componentSource.getBaseNameWithoutExtension();
  const isComponentDeclaration = (declaration: Node) => {
    if (declaration.getSourceFile() !== componentSource) return false;
    if (
      Node.isFunctionDeclaration(declaration) ||
      Node.isVariableDeclaration(declaration) ||
      Node.isClassDeclaration(declaration)
    ) {
      return declaration.getName() === componentName;
    }
    if (Node.isExportAssignment(declaration)) {
      return declaration.getExpression().getText() === componentName;
    }
    return false;
  };
  const symbolResolvesToComponent = (input: MorphSymbol | undefined) => {
    let symbol = input;
    const visited = new Set<MorphSymbol>();
    while (symbol !== undefined && !visited.has(symbol)) {
      visited.add(symbol);
      if (symbol.getDeclarations().some(isComponentDeclaration)) return true;
      symbol = symbol.getAliasedSymbol();
    }
    return false;
  };

  for (const declaration of sourceFile.getImportDeclarations()) {
    const resolvedSource = declaration.getModuleSpecifierSourceFile();
    const importedBaseName = path.posix.basename(
      declaration.getModuleSpecifierValue(),
    );
    const directModuleMatch =
      resolvedSource !== componentSource &&
      importedBaseName !== componentBaseName;

    for (const namedImport of declaration.getNamedImports()) {
      if (!directModuleMatch && namedImport.getName() === componentName) {
        names.add(namedImport.getAliasNode()?.getText() ?? componentName);
        continue;
      }
      if (symbolResolvesToComponent(namedImport.getNameNode().getSymbol())) {
        names.add(
          namedImport.getAliasNode()?.getText() ?? namedImport.getName(),
        );
      }
    }

    const defaultImport = declaration.getDefaultImport();
    if (
      defaultImport !== undefined &&
      symbolResolvesToComponent(defaultImport.getSymbol())
    ) {
      names.add(defaultImport.getText());
    }

    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport !== undefined && resolvedSource !== undefined) {
      const exportedDeclarations =
        resolvedSource.getExportedDeclarations().get(componentName) ?? [];
      if (
        exportedDeclarations.some(isComponentDeclaration) ||
        exportedDeclarations.some((exported) =>
          symbolResolvesToComponent(exported.getSymbol()),
        )
      ) {
        names.add(`${namespaceImport.getText()}.${componentName}`);
      }
    }
  }

  return names;
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

export const getForwardRefCall = (
  initializer: Expression | undefined,
): CallExpression | undefined => {
  if (initializer === undefined) return undefined;

  const expression = unwrapExpression(initializer);
  if (!Node.isCallExpression(expression)) return undefined;

  const callee = expression.getExpression().getText();
  if (callee !== "forwardRef" && !callee.endsWith(".forwardRef")) {
    return undefined;
  }

  return expression;
};

export const getComponentFunction = (
  sourceFile: SourceFile,
  componentName: string,
): ComponentFunction | undefined => {
  const declaration = sourceFile.getFunction(componentName);
  if (declaration !== undefined) return declaration;

  const initializer = sourceFile
    .getVariableDeclaration(componentName)
    ?.getInitializer();
  if (
    initializer !== undefined &&
    (Node.isArrowFunction(initializer) ||
      Node.isFunctionExpression(initializer))
  ) {
    return initializer;
  }

  const renderFunction = getForwardRefCall(initializer)?.getArguments()[0];
  if (
    renderFunction !== undefined &&
    (Node.isArrowFunction(renderFunction) ||
      Node.isFunctionExpression(renderFunction))
  ) {
    return renderFunction;
  }

  return undefined;
};

const insertTypeAliasBeforeComponent = ({
  sourceFile,
  componentFunction,
  propsTypeName,
  type,
}: {
  readonly sourceFile: SourceFile;
  readonly componentFunction: ComponentFunction;
  readonly propsTypeName: string;
  readonly type: string;
}) => {
  const statement = Node.isStatement(componentFunction)
    ? componentFunction
    : componentFunction.getFirstAncestor((ancestor) =>
        Node.isStatement(ancestor),
      );
  if (statement === undefined) {
    throw new PropsExtractionFailedError({
      propsTypeName,
      filePath: sourceFile.getFilePath(),
    });
  }

  const statementIndex = sourceFile.getStatements().indexOf(statement);
  if (statementIndex === -1) {
    throw new PropsExtractionFailedError({
      propsTypeName,
      filePath: sourceFile.getFilePath(),
    });
  }

  return sourceFile.insertTypeAlias(statementIndex, {
    name: propsTypeName,
    type,
  });
};

export const getOrExtractPropsDeclaration = ({
  sourceFile,
  componentFunction,
  componentName,
  propsTypeName,
}: {
  readonly sourceFile: SourceFile;
  readonly componentFunction: ComponentFunction;
  readonly componentName: string;
  readonly propsTypeName: string;
}): PropsDeclaration => {
  const typeAlias = sourceFile.getTypeAlias(propsTypeName);
  if (typeAlias !== undefined) return typeAlias;

  const interfaceDeclaration = sourceFile.getInterface(propsTypeName);
  if (interfaceDeclaration !== undefined) return interfaceDeclaration;

  const parameter = componentFunction.getParameters()[0];
  const inlineType = parameter?.getTypeNode();
  if (
    parameter !== undefined &&
    inlineType !== undefined &&
    inlineType.getText() !== propsTypeName
  ) {
    const extracted = insertTypeAliasBeforeComponent({
      sourceFile,
      componentFunction,
      propsTypeName,
      type: inlineType.getText(),
    });
    parameter.setType(propsTypeName);
    return extracted;
  }

  const initializer = sourceFile
    .getVariableDeclaration(componentName)
    ?.getInitializer();
  const forwardRefPropsType =
    getForwardRefCall(initializer)?.getTypeArguments()[1];
  if (forwardRefPropsType === undefined) {
    throw new PropsTypeNotFoundError({ propsTypeName });
  }

  const extracted = insertTypeAliasBeforeComponent({
    sourceFile,
    componentFunction,
    propsTypeName,
    type: forwardRefPropsType.getText(),
  });
  forwardRefPropsType.replaceWithText(propsTypeName);
  return extracted;
};

export const getStaticAttributeValue = (attribute: JsxAttribute) => {
  const initializer = attribute.getInitializer();
  if (initializer === undefined) return undefined;
  if (Node.isStringLiteral(initializer)) return initializer.getLiteralValue();
  if (!Node.isJsxExpression(initializer)) return undefined;

  const input = initializer.getExpression();
  if (input === undefined) return undefined;
  const expression = unwrapExpression(input);
  if (
    Node.isStringLiteral(expression) ||
    Node.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.getLiteralValue();
  }
  if (Node.isNumericLiteral(expression)) return expression.getLiteralValue();
  return undefined;
};

const normalizeClassName = (value: string) =>
  value.trim().split(/\s+/u).filter(Boolean).join(" ");

export const valuesMatch = (
  propName: string,
  left: PropValue,
  right: PropValue,
) => {
  if (propName !== "className") return left === right;
  if (typeof left !== "string" || typeof right !== "string") return false;
  return normalizeClassName(left) === normalizeClassName(right);
};

export const removePropValue = (
  property: PropertySignature,
  propName: string,
  values: ReadonlyArray<PropValue>,
  value: PropValue,
) => {
  const nextValues = values.filter(
    (candidate) => !valuesMatch(propName, candidate, value),
  );
  if (nextValues.length === 0) {
    property.remove();
    return;
  }
  if (nextValues.length !== values.length) {
    property.setType(nextValues.map(renderValue).join(" | "));
  }
};
