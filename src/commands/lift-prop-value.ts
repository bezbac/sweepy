import path from "node:path";

import { Console, Effect, Schema } from "effect";
import { type JsxAttribute, Node, SyntaxKind } from "ts-morph";

import { executeChanges } from "../execute-changes";
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
} from "../prop-action";

type LiftPropValueOptions = PropActionOptions & {
  readonly sourcePropName: string;
  readonly sourceValue: string;
  readonly wrapperName: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
};

class LiftPropValueError extends Schema.TaggedErrorClass<LiftPropValueError>(
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
  };
};

const toLiftPropValueError = (cause: unknown) =>
  new LiftPropValueError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const liftPropValue = (options: LiftPropValueOptions) =>
  Effect.gen(function* () {
    const { changedFiles, liftedUsages, project, unsupported } =
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

    const saved = yield* executeChanges({
      project,
      changedFiles,
      repositoryRoot: options.repositoryRoot,
      yes: options.yes,
      dryRun: options.dryRun,
    }).pipe(Effect.mapError(toLiftPropValueError));
    return {
      changedFiles: saved ? changedFiles : [],
      liftedUsages,
      unsupported,
    };
  });
