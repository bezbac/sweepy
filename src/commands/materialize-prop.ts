import path from "node:path";

import { Console, Effect, Schema } from "effect";
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
} from "ts-morph";

import { executeChanges } from "../execute-changes";
import {
  type ComponentFunction,
  getComponentFunction,
  getLocalComponentNames,
  getOrExtractPropsDeclaration,
} from "../prop-action";

type FiniteValue = string | number;

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

class MaterializePropError extends Schema.TaggedErrorClass<MaterializePropError>(
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
      throw new Error(`Prop ${propName} not found in ${propsTypeName}`);
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
    throw new Error(`No TypeScript files found under ${searchRoot}`);
  }

  const { sourceFile: componentSource, componentFunction } = findComponent(
    sourceFiles,
    componentName,
    absoluteComponentFile,
  );

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

const toMaterializePropError = (cause: unknown) =>
  new MaterializePropError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const materializeProp = (options: MaterializePropOptions) =>
  Effect.gen(function* () {
    const { changedFiles, project, unsupported } = yield* Effect.try({
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

    const saved = yield* executeChanges({
      project,
      changedFiles,
      repositoryRoot: options.repositoryRoot,
      yes: options.yes,
      dryRun: options.dryRun,
    }).pipe(Effect.mapError(toMaterializePropError));
    return { changedFiles: saved ? changedFiles : [], unsupported };
  });
