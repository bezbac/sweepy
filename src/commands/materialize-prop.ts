import path from "node:path";

import { Console, Effect, Schema } from "effect";
import {
  type ArrowFunction,
  type Expression,
  type FunctionDeclaration,
  type FunctionExpression,
  type JsxAttribute,
  Node,
  Project,
  type PropertySignature,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";

import { confirm } from "../confirm.js";

type FiniteValue = string | number;

type FiniteExpression =
  | { readonly kind: "value"; readonly value: FiniteValue }
  | {
      readonly kind: "conditional";
      readonly condition: string;
      readonly whenTrue: FiniteExpression;
      readonly whenFalse: FiniteExpression;
    };

type ComponentFunction =
  FunctionDeclaration | ArrowFunction | FunctionExpression;

type MaterializePropOptions = {
  readonly repositoryRoot: string;
  readonly componentName: string;
  readonly propsTypeName: string;
  readonly searchRoot: string;
  readonly tsconfigPath: string;
  readonly componentFile: string | undefined;
  readonly propName: string;
  readonly yes: boolean;
};

export class MaterializePropError extends Schema.TaggedErrorClass<MaterializePropError>(
  "sweepy/MaterializePropError",
)("MaterializePropError", {
  message: Schema.String,
}) {}

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
    throw new Error("Class name fragments must be strings");
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

const analyzeExpression = (
  input: Expression,
  isClassName: boolean,
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

  if (Node.isConditionalExpression(expression)) {
    const whenTrue = analyzeExpression(expression.getWhenTrue(), isClassName);
    const whenFalse = analyzeExpression(expression.getWhenFalse(), isClassName);
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
    const whenTrue = analyzeExpression(expression.getRight(), true);
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
      const spanExpression = analyzeExpression(span.getExpression(), true);
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

  return undefined;
};

const collectValues = (
  expression: FiniteExpression,
  values: Map<string, FiniteValue>,
) => {
  if (expression.kind === "value") {
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
    return typeof expression.value === "string"
      ? JSON.stringify(expression.value)
      : String(expression.value);
  }

  return `${expression.condition} ? ${renderExpression(expression.whenTrue)} : ${renderExpression(expression.whenFalse)}`;
};

const getComponentFunction = (
  sourceFile: SourceFile,
  componentName: string,
): ComponentFunction | undefined => {
  const declaration = sourceFile.getFunction(componentName);
  if (declaration !== undefined) return declaration;

  const initializer = sourceFile
    .getVariableDeclarations()
    .find((candidate) => candidate.getName() === componentName)
    ?.getInitializer();

  if (
    initializer !== undefined &&
    (Node.isArrowFunction(initializer) ||
      Node.isFunctionExpression(initializer))
  ) {
    return initializer;
  }

  return undefined;
};

const findComponent = (
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

    const componentFunction = getComponentFunction(sourceFile, componentName);
    if (componentFunction === undefined) {
      throw new Error(
        `Component ${componentName} not found in ${sourceFile.getFilePath()}`,
      );
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
    throw new Error(`Component not found: ${componentName}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple components named ${componentName} found; pass --component-file`,
    );
  }

  return matches[0]!;
};

const getOrExtractProperty = ({
  sourceFile,
  componentFunction,
  propsTypeName,
  propName,
}: {
  readonly sourceFile: SourceFile;
  readonly componentFunction: ComponentFunction;
  readonly propsTypeName: string;
  readonly propName: string;
}): PropertySignature => {
  const typeAlias = sourceFile.getTypeAlias(propsTypeName);
  if (typeAlias !== undefined) {
    const typeNode = typeAlias.getTypeNodeOrThrow();
    if (!Node.isTypeLiteral(typeNode)) {
      throw new Error(`${propsTypeName} must be an object type`);
    }
    const property = typeNode.getProperty(propName);
    if (property === undefined) {
      throw new Error(`Prop ${propName} not found in ${propsTypeName}`);
    }
    return property;
  }

  const interfaceDeclaration = sourceFile.getInterface(propsTypeName);
  if (interfaceDeclaration !== undefined) {
    const property = interfaceDeclaration.getProperty(propName);
    if (property === undefined) {
      throw new Error(`Prop ${propName} not found in ${propsTypeName}`);
    }
    return property;
  }

  const parameter = componentFunction.getParameters()[0];
  const inlineType = parameter?.getTypeNode();
  if (
    parameter === undefined ||
    inlineType === undefined ||
    !Node.isTypeLiteral(inlineType)
  ) {
    throw new Error(`Props type not found: ${propsTypeName}`);
  }

  const inlineTypeText = inlineType.getText();
  const statement = Node.isStatement(componentFunction)
    ? componentFunction
    : componentFunction.getFirstAncestor((ancestor) =>
        Node.isStatement(ancestor),
      );
  if (statement === undefined) {
    throw new Error(`Could not extract inline props for ${propsTypeName}`);
  }
  const statementIndex = sourceFile.getStatements().indexOf(statement);
  const extracted = sourceFile.insertTypeAlias(statementIndex, {
    name: propsTypeName,
    type: inlineTypeText,
  });
  parameter.setType(propsTypeName);

  const extractedType = extracted.getTypeNodeOrThrow();
  if (!Node.isTypeLiteral(extractedType)) {
    throw new Error(`Could not extract inline props for ${propsTypeName}`);
  }
  const property = extractedType.getProperty(propName);
  if (property === undefined) {
    throw new Error(`Prop ${propName} not found in ${propsTypeName}`);
  }
  return property;
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

const getLocalComponentNames = (
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

const prepareMaterialization = ({
  repositoryRoot,
  componentName,
  propsTypeName,
  searchRoot,
  tsconfigPath,
  componentFile,
  propName,
  yes,
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
    throw new Error(`No TypeScript files found under ${searchRoot}`);
  }

  const { sourceFile: componentSource, componentFunction } = findComponent(
    sourceFiles,
    componentName,
    absoluteComponentFile,
  );
  const property = getOrExtractProperty({
    sourceFile: componentSource,
    componentFunction,
    propsTypeName,
    propName,
  });

  const isClassName = propName === "className";
  const discoveredValues = new Map<string, FiniteValue>();
  const unsupported: Array<string> = [];

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
        unsupported.push(
          `${path.relative(repositoryRoot, sourceFile.getFilePath())}:${attribute.getStartLineNumber()} ${attribute.getText()}`,
        );
        continue;
      }

      if ("kind" in expression) {
        collectValues(expression, discoveredValues);
        continue;
      }

      const analyzed = analyzeExpression(expression, isClassName);
      if (analyzed === undefined) {
        unsupported.push(
          `${path.relative(repositoryRoot, sourceFile.getFilePath())}:${attribute.getStartLineNumber()} ${attribute.getText()}`,
        );
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
    throw new Error(
      `No supported values found for ${componentName}.${propName}`,
    );
  }

  const materializedType = values
    .map((literal) => JSON.stringify(literal))
    .join(" | ");
  if (property.getTypeNode()?.getText() !== materializedType) {
    property.setType(materializedType);
  }

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

  return { project, changedFiles, unsupported, yes };
};

const toMaterializePropError = (cause: unknown) =>
  new MaterializePropError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const materializeProp = (options: MaterializePropOptions) =>
  Effect.gen(function* () {
    const { changedFiles, project, unsupported, yes } = yield* Effect.try({
      try: () => prepareMaterialization(options),
      catch: toMaterializePropError,
    });

    if (unsupported.length > 0) {
      yield* Console.log(
        `Unsupported usages left unchanged:\n${unsupported.map((item) => `  ${item}`).join("\n")}`,
      );
    }

    if (changedFiles.length === 0) {
      yield* Console.log("No changes.");
      return { changedFiles, unsupported };
    }

    if (!yes) {
      const shouldSave = yield* confirm(
        `Files to update:\n${changedFiles.map((file) => `  ${file}`).join("\n")}\nSave these changes?`,
      ).pipe(Effect.mapError(toMaterializePropError));
      if (!shouldSave) {
        yield* Console.log("Changes discarded.");
        return { changedFiles: [], unsupported };
      }
    }

    yield* Effect.tryPromise({
      try: () => project.save(),
      catch: toMaterializePropError,
    });
    yield* Console.log(`Updated ${changedFiles.length} file(s).`);
    return { changedFiles, unsupported };
  });
