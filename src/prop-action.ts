import path from "node:path";

import {
  type Expression,
  type JsxAttribute,
  Node,
  Project,
  type PropertySignature,
  type SourceFile,
  type TypeLiteralNode,
} from "ts-morph";

export type PropValue = string | number;

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

  throw new Error(
    `Value ${JSON.stringify(input)} is not in ${propName}: ${values.map(renderValue).join(" | ")}`,
  );
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
) => {
  if (explicitPath !== undefined) {
    const sourceFile = sourceFiles.find(
      (candidate) => path.resolve(candidate.getFilePath()) === explicitPath,
    );
    if (sourceFile === undefined) {
      throw new Error(`Component file not found: ${explicitPath}`);
    }
    if (!hasComponent(sourceFile, componentName)) {
      throw new Error(
        `Component ${componentName} not found in ${sourceFile.getFilePath()}`,
      );
    }
    return sourceFile;
  }

  const matches = sourceFiles.filter((sourceFile) =>
    hasComponent(sourceFile, componentName),
  );
  if (matches.length === 0) {
    throw new Error(`Component not found: ${componentName}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple components named ${componentName} found; pass --component-file`,
    );
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
    throw new Error(`No TypeScript files found under ${options.searchRoot}`);
  }
  const componentSource = findComponentSource(
    sourceFiles,
    options.componentName,
    absoluteComponentFile,
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
  for (const declaration of sourceFile.getImportDeclarations()) {
    const resolvedSource = declaration.getModuleSpecifierSourceFile();
    const importedBaseName = path.posix.basename(
      declaration.getModuleSpecifierValue(),
    );
    if (
      resolvedSource !== componentSource &&
      importedBaseName !== componentBaseName
    ) {
      continue;
    }

    for (const namedImport of declaration.getNamedImports()) {
      if (namedImport.getName() !== componentName) continue;
      names.add(namedImport.getAliasNode()?.getText() ?? componentName);
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
