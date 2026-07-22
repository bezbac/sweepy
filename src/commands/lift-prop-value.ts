import path from "node:path";

import { Console, Effect, Schema } from "effect";
import { type JsxAttribute, Node, SyntaxKind } from "ts-morph";

import { confirm } from "../confirm.js";
import {
  type PropActionOptions,
  getLocalComponentNames,
  getStaticAttributeValue,
  getStrictPropValues,
  loadPropActionProject,
  removePropValue,
  renderInitializer,
  selectValue,
  valuesMatch,
} from "../prop-action.js";

type LiftPropValueOptions = PropActionOptions & {
  readonly sourcePropName: string;
  readonly sourceValue: string;
  readonly wrapperName: string;
  readonly yes: boolean;
};

export class LiftPropValueError extends Schema.TaggedErrorClass<LiftPropValueError>(
  "sweepy/LiftPropValueError",
)("LiftPropValueError", {
  message: Schema.String,
}) {}

const prepareLift = (options: LiftPropValueOptions) => {
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

  const sourceValues = getStrictPropValues(sourceProperty);
  if (sourceValues === undefined) {
    throw new Error(
      `${options.propsTypeName}.${options.sourcePropName} must be materialized first`,
    );
  }
  const sourceValue = selectValue(
    options.sourceValue,
    sourceValues,
    options.sourcePropName,
  );

  const unsupported: Array<string> = [];
  let liftedUsages = 0;

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
    ].sort((left, right) => right.getStart() - left.getStart());

    for (const element of openingElements) {
      if (
        element.wasForgotten() ||
        !localComponentNames.has(element.getTagNameNode().getText())
      ) {
        continue;
      }
      const sourceAttribute = element
        .getAttributes()
        .find(
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

      sourceAttribute.remove();
      const wrapperAttribute = `${options.sourcePropName}=${renderInitializer(sourceValue)}`;

      if (Node.isJsxSelfClosingElement(element)) {
        const componentText = element.getText();
        element.replaceWithText(
          `<${options.wrapperName} ${wrapperAttribute}>${componentText}</${options.wrapperName}>`,
        );
        liftedUsages += 1;
        continue;
      }

      const jsxElement = element.getParent();
      if (!Node.isJsxElement(jsxElement)) {
        unsupported.push(
          `${path.relative(options.repositoryRoot, sourceFile.getFilePath())}:${element.getStartLineNumber()} could not find full ${options.componentName} JSX element`,
        );
        continue;
      }
      const componentText = jsxElement.getText();
      jsxElement.replaceWithText(
        `<${options.wrapperName} ${wrapperAttribute}>${componentText}</${options.wrapperName}>`,
      );
      liftedUsages += 1;
    }
  }

  removePropValue(
    sourceProperty,
    options.sourcePropName,
    sourceValues,
    sourceValue,
  );

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
    liftedUsages,
    project,
    unsupported,
    yes: options.yes,
  };
};

const toLiftPropValueError = (cause: unknown) =>
  new LiftPropValueError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const liftPropValue = (options: LiftPropValueOptions) =>
  Effect.gen(function* () {
    const { changedFiles, liftedUsages, project, unsupported, yes } =
      yield* Effect.try({
        try: () => prepareLift(options),
        catch: toLiftPropValueError,
      });

    yield* Console.log(`Lifted ${liftedUsages} usage(s).`);
    if (unsupported.length > 0) {
      yield* Console.log(
        `Unsupported usages left unchanged:\n${unsupported.map((item) => `  ${item}`).join("\n")}`,
      );
    }
    if (changedFiles.length === 0) {
      yield* Console.log("No changes.");
      return { changedFiles, liftedUsages, unsupported };
    }

    if (!yes) {
      const shouldSave = yield* confirm(
        `Files to update:\n${changedFiles.map((file) => `  ${file}`).join("\n")}\nSave these changes?`,
      ).pipe(Effect.mapError(toLiftPropValueError));
      if (!shouldSave) {
        yield* Console.log("Changes discarded.");
        return { changedFiles: [], liftedUsages, unsupported };
      }
    }

    yield* Effect.tryPromise({
      try: () => project.save(),
      catch: toLiftPropValueError,
    });
    yield* Console.log(`Updated ${changedFiles.length} file(s).`);
    return { changedFiles, liftedUsages, unsupported };
  });
