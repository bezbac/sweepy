import path from "node:path";

import { Console, Effect, Schema } from "effect";
import { type JsxAttribute, Node, SyntaxKind } from "ts-morph";

import { confirm } from "../confirm";
import {
  type PropActionOptions,
  getLocalComponentNames,
  getStaticAttributeValue,
  getStrictPropValues,
  loadPropActionProject,
  removePropValue,
  renderInitializer,
  renderValue,
  selectValue,
  valuesMatch,
} from "../prop-action";

type ReplacePropValueOptions = PropActionOptions & {
  readonly sourcePropName: string;
  readonly sourceValue: string;
  readonly targetPropName: string;
  readonly targetValue: string;
  readonly yes: boolean;
};

class ReplacePropValueError extends Schema.TaggedErrorClass<ReplacePropValueError>(
  "sweepy/ReplacePropValueError",
)("ReplacePropValueError", {
  message: Schema.String,
}) {}

const prepareReplacement = (options: ReplacePropValueOptions) => {
  if (options.sourcePropName === options.targetPropName) {
    throw new Error("Source prop and target prop must be different");
  }

  const { componentSource, project, properties, sourceFiles } =
    loadPropActionProject(options);
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

  removePropValue(
    sourceProperty,
    options.sourcePropName,
    sourceValues,
    sourceValue,
  );
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
