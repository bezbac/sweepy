import path from "node:path";

import { Console, Effect } from "effect";
import { type JsxAttribute, Node, SyntaxKind } from "ts-morph";

import {
  IdenticalSourceAndTargetPropError,
  preserveSweepyError,
  PropNotFoundError,
  PropNotMaterializedError,
} from "../errors";
import { executeChanges } from "../execute-changes";
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
import {
  formatUnsupportedCases,
  type UnsupportedCase,
} from "../unsupported-case";

type ReplacePropValueOptions = PropActionOptions & {
  readonly sourcePropName: string;
  readonly sourceValue: string;
  readonly targetPropName: string;
  readonly targetValue: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
};

const prepareReplacement = (options: ReplacePropValueOptions) => {
  if (options.sourcePropName === options.targetPropName) {
    throw new IdenticalSourceAndTargetPropError({
      propName: options.sourcePropName,
    });
  }

  const { componentSource, project, properties, sourceFiles } =
    loadPropActionProject(options);
  const sourceProperty = properties.find(
    (property) => property.getName() === options.sourcePropName,
  );
  if (sourceProperty === undefined) {
    throw new PropNotFoundError({
      propName: options.sourcePropName,
      propsTypeName: options.propsTypeName,
    });
  }
  const targetProperty = properties.find(
    (property) => property.getName() === options.targetPropName,
  );
  if (targetProperty === undefined) {
    throw new PropNotFoundError({
      propName: options.targetPropName,
      propsTypeName: options.propsTypeName,
    });
  }

  const sourceValues = getStrictPropValues(sourceProperty);
  if (sourceValues === undefined) {
    throw new PropNotMaterializedError({
      propName: options.sourcePropName,
      propsTypeName: options.propsTypeName,
    });
  }
  const targetValues = getStrictPropValues(targetProperty);
  if (targetValues === undefined) {
    throw new PropNotMaterializedError({
      propName: options.targetPropName,
      propsTypeName: options.propsTypeName,
    });
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

  const unsupported: Array<UnsupportedCase> = [];
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
        unsupported.push({
          kind: "usage",
          filePath: path.relative(
            options.repositoryRoot,
            sourceFile.getFilePath(),
          ),
          lineNumber: sourceAttribute.getStartLineNumber(),
          source: sourceAttribute.getText(),
          reason: { kind: "prop-value-not-static" },
        });
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
          unsupported.push({
            kind: "usage",
            filePath: path.relative(
              options.repositoryRoot,
              sourceFile.getFilePath(),
            ),
            lineNumber: sourceAttribute.getStartLineNumber(),
            source: element.getText(),
            reason: {
              kind: "target-prop-conflict",
              propName: options.targetPropName,
            },
          });
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
  };
};

export const replacePropValue = (options: ReplacePropValueOptions) =>
  Effect.gen(function* () {
    const { changedFiles, project, replacedUsages, unsupported } =
      yield* Effect.try({
        try: () => prepareReplacement(options),
        catch: preserveSweepyError,
      });

    yield* Console.log(`Replaced ${replacedUsages} usage(s).`);
    if (unsupported.length > 0) {
      yield* Console.log(
        `Unsupported usages left unchanged:\n${formatUnsupportedCases(unsupported)}`,
      );
    }
    if (changedFiles.length === 0) {
      yield* Console.log("No changes.");
      return { changedFiles, replacedUsages, unsupported };
    }

    const saved = yield* executeChanges({
      project,
      changedFiles,
      repositoryRoot: options.repositoryRoot,
      yes: options.yes,
      dryRun: options.dryRun,
    });
    return {
      changedFiles: saved ? changedFiles : [],
      replacedUsages,
      unsupported,
    };
  });
