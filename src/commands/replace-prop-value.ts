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
  type TypeLiteralNode,
} from "ts-morph";

import { confirm } from "../confirm.js";

type PropValue = string | number;

type ReplacePropValueOptions = {
  readonly repositoryRoot: string;
  readonly componentName: string;
  readonly propsTypeName: string;
  readonly searchRoot: string;
  readonly tsconfigPath: string;
  readonly componentFile: string | undefined;
  readonly sourcePropName: string;
  readonly sourceValue: string;
  readonly targetPropName: string;
  readonly targetValue: string;
  readonly yes: boolean;
};

export class ReplacePropValueError extends Schema.TaggedErrorClass<ReplacePropValueError>(
  "sweepy/ReplacePropValueError",
)("ReplacePropValueError", {
  message: Schema.String,
}) {}

const renderValue = (value: PropValue) =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

const renderInitializer = (value: PropValue) =>
  typeof value === "string" ? JSON.stringify(value) : `{${value}}`;

const getStrictPropValues = (property: PropertySignature) => {
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

const selectValue = (
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

const getStaticAttributeValue = (attribute: JsxAttribute) => {
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

const valuesMatch = (propName: string, left: PropValue, right: PropValue) => {
  if (propName !== "className") return left === right;
  if (typeof left !== "string" || typeof right !== "string") return false;
  return normalizeClassName(left) === normalizeClassName(right);
};

const prepareReplacement = (options: ReplacePropValueOptions) => {
  if (options.sourcePropName === options.targetPropName) {
    throw new Error("Source prop and target prop must be different");
  }

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
  const properties = getPropsProperties(componentSource, options.propsTypeName);
  const sourceProperty = properties.find(
    (property) => property.getName() === options.sourcePropName,
  );
  if (sourceProperty === undefined) {
    throw new Error(
      `Prop ${options.sourcePropName} not found in ${options.propsTypeName}`,
    );
  }
  const targetProperty = properties.find(
    (property) => property.getName() === options.targetPropName,
  );
  if (targetProperty === undefined) {
    throw new Error(
      `Prop ${options.targetPropName} not found in ${options.propsTypeName}`,
    );
  }

  const sourceValues = getStrictPropValues(sourceProperty);
  if (sourceValues === undefined) {
    throw new Error(
      `${options.propsTypeName}.${options.sourcePropName} must be materialized first`,
    );
  }
  const targetValues = getStrictPropValues(targetProperty);
  if (targetValues === undefined) {
    throw new Error(
      `${options.propsTypeName}.${options.targetPropName} must be materialized first`,
    );
  }
  const sourceValue = selectValue(
    options.sourceValue,
    sourceValues,
    options.sourcePropName,
  );
  const targetValue = selectValue(
    options.targetValue,
    targetValues,
    options.targetPropName,
  );

  const unsupported: Array<string> = [];
  let replacedUsages = 0;

  for (const sourceFile of sourceFiles) {
    const localComponentNames = getLocalComponentNames(
      sourceFile,
      componentSource,
      options.componentName,
    );
    if (localComponentNames.size === 0) continue;

    const openingElements = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];
    for (const element of openingElements) {
      if (!localComponentNames.has(element.getTagNameNode().getText())) {
        continue;
      }
      const attributes = element.getAttributes();
      const sourceAttribute = attributes.find(
        (candidate): candidate is JsxAttribute =>
          Node.isJsxAttribute(candidate) &&
          candidate.getNameNode().getText() === options.sourcePropName,
      );
      if (sourceAttribute === undefined) continue;

      const actualSourceValue = getStaticAttributeValue(sourceAttribute);
      if (actualSourceValue === undefined) {
        unsupported.push(
          `${path.relative(options.repositoryRoot, sourceFile.getFilePath())}:${sourceAttribute.getStartLineNumber()} ${sourceAttribute.getText()}`,
        );
        continue;
      }
      if (
        !valuesMatch(options.sourcePropName, actualSourceValue, sourceValue)
      ) {
        continue;
      }

      const targetAttribute = attributes.find(
        (candidate): candidate is JsxAttribute =>
          Node.isJsxAttribute(candidate) &&
          candidate.getNameNode().getText() === options.targetPropName,
      );
      if (targetAttribute !== undefined) {
        const actualTargetValue = getStaticAttributeValue(targetAttribute);
        if (
          actualTargetValue === undefined ||
          !valuesMatch(options.targetPropName, actualTargetValue, targetValue)
        ) {
          unsupported.push(
            `${path.relative(options.repositoryRoot, sourceFile.getFilePath())}:${sourceAttribute.getStartLineNumber()} ${options.targetPropName} already exists with a different value`,
          );
          continue;
        }
      } else {
        element.addAttribute({
          name: options.targetPropName,
          initializer: renderInitializer(targetValue),
        });
      }

      sourceAttribute.remove();
      replacedUsages += 1;
    }
  }

  const nextSourceValues = sourceValues.filter(
    (value) => !valuesMatch(options.sourcePropName, value, sourceValue),
  );
  if (nextSourceValues.length === 0) {
    sourceProperty.remove();
  } else if (nextSourceValues.length !== sourceValues.length) {
    sourceProperty.setType(nextSourceValues.map(renderValue).join(" | "));
  }
  if (
    !targetValues.some((value) =>
      valuesMatch(options.targetPropName, value, targetValue),
    )
  ) {
    targetProperty.setType(
      [...targetValues, targetValue].map(renderValue).join(" | "),
    );
  }

  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.isSaved()) continue;
    sourceFile.formatText({ indentSize: 2 });
  }

  const changedFiles = project
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isSaved())
    .map((sourceFile) =>
      path.relative(options.repositoryRoot, sourceFile.getFilePath()),
    );

  return {
    changedFiles,
    project,
    replacedUsages,
    unsupported,
    yes: options.yes,
  };
};

const toReplacePropValueError = (cause: unknown) =>
  new ReplacePropValueError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const replacePropValue = (options: ReplacePropValueOptions) =>
  Effect.gen(function* () {
    const { changedFiles, project, replacedUsages, unsupported, yes } =
      yield* Effect.try({
        try: () => prepareReplacement(options),
        catch: toReplacePropValueError,
      });

    yield* Console.log(`Replaced ${replacedUsages} usage(s).`);
    if (unsupported.length > 0) {
      yield* Console.log(
        `Unsupported usages left unchanged:\n${unsupported.map((item) => `  ${item}`).join("\n")}`,
      );
    }
    if (changedFiles.length === 0) {
      yield* Console.log("No changes.");
      return { changedFiles, replacedUsages, unsupported };
    }

    if (!yes) {
      const shouldSave = yield* confirm(
        `Files to update:\n${changedFiles.map((file) => `  ${file}`).join("\n")}\nSave these changes?`,
      ).pipe(Effect.mapError(toReplacePropValueError));
      if (!shouldSave) {
        yield* Console.log("Changes discarded.");
        return { changedFiles: [], replacedUsages, unsupported };
      }
    }

    yield* Effect.tryPromise({
      try: () => project.save(),
      catch: toReplacePropValueError,
    });
    yield* Console.log(`Updated ${changedFiles.length} file(s).`);
    return { changedFiles, replacedUsages, unsupported };
  });
