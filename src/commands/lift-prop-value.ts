import path from "node:path";

import { Console, Effect } from "effect";
import { type JsxAttribute, Node, SyntaxKind } from "ts-morph";

import {
  preserveSweepyError,
  PropNotFoundError,
  PropNotMaterializedError,
} from "../errors";
import { executeChanges } from "../execute-changes";
import {
  type PropActionOptions,
  formatAndGetChangedFiles,
  getComponentFunction,
  getLocalComponentNames,
  getStaticAttributeValue,
  getStrictPropValues,
  loadPropActionProject,
  removeEmptyPropsDeclaration,
  removePropValue,
  renderInitializer,
  selectValue,
  valuesMatch,
} from "../prop-action";
import {
  formatUnsupportedCases,
  type UnsupportedCase,
} from "../unsupported-case";

type LiftPropValueOptions = PropActionOptions & {
  readonly sourcePropName: string;
  readonly sourceValue: string;
  readonly wrapperName: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
};

const prepareLift = (options: LiftPropValueOptions) =>
  Effect.gen(function* () {
    const { componentSource, properties, sourceFiles } =
      yield* loadPropActionProject(options);
    const prepared = yield* Effect.try({
      try: () => {
        const sourceProperty = properties.find(
          (property) => property.getName() === options.sourcePropName,
        );
        if (sourceProperty === undefined) {
          throw new PropNotFoundError({
            propName: options.sourcePropName,
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
        const sourceValue = selectValue(
          options.sourceValue,
          sourceValues,
          options.sourcePropName,
        );
        const componentFunction = getComponentFunction(
          componentSource,
          options.componentName,
        );
        const propsDeclaration = sourceProperty.getFirstAncestor(
          (ancestor) =>
            Node.isTypeAliasDeclaration(ancestor) ||
            Node.isInterfaceDeclaration(ancestor),
        );

        const unsupported: Array<UnsupportedCase> = [];
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
            ...sourceFile.getDescendantsOfKind(
              SyntaxKind.JsxSelfClosingElement,
            ),
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
              !valuesMatch(
                options.sourcePropName,
                actualSourceValue,
                sourceValue,
              )
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
              unsupported.push({
                kind: "usage",
                filePath: path.relative(
                  options.repositoryRoot,
                  sourceFile.getFilePath(),
                ),
                lineNumber: element.getStartLineNumber(),
                source: element.getText(),
                reason: {
                  kind: "jsx-element-not-found",
                  componentName: options.componentName,
                },
              });
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
        if (
          propsDeclaration !== undefined &&
          (Node.isTypeAliasDeclaration(propsDeclaration) ||
            Node.isInterfaceDeclaration(propsDeclaration))
        ) {
          const emptyPropsCleanup = removeEmptyPropsDeclaration({
            declaration: propsDeclaration,
            componentFunction,
            componentName: options.componentName,
          });
          if (emptyPropsCleanup === "unsupported") {
            unsupported.push({
              kind: "component",
              filePath: path.relative(
                options.repositoryRoot,
                componentSource.getFilePath(),
              ),
              reason: { kind: "empty-props-cleanup-unsupported" },
            });
            return {
              collectChangedFiles: false as const,
              liftedUsages: 0,
              unsupported,
            };
          }
        }

        return {
          collectChangedFiles: true as const,
          liftedUsages,
          unsupported,
        };
      },
      catch: preserveSweepyError,
    });
    const changedFiles = prepared.collectChangedFiles
      ? yield* formatAndGetChangedFiles(options.repositoryRoot)
      : [];
    return {
      changedFiles,
      liftedUsages: prepared.liftedUsages,
      unsupported: prepared.unsupported,
    };
  });

export const liftPropValue = (options: LiftPropValueOptions) =>
  Effect.gen(function* () {
    const { changedFiles, liftedUsages, unsupported } =
      yield* prepareLift(options);

    yield* Console.log(`Lifted ${liftedUsages} usage(s).`);
    if (unsupported.length > 0) {
      yield* Console.log(
        `Unsupported usages left unchanged:\n${formatUnsupportedCases(unsupported)}`,
      );
    }
    if (changedFiles.length === 0) {
      yield* Console.log("No changes.");
      return { changedFiles, liftedUsages, unsupported };
    }

    const saved = yield* executeChanges({
      changedFiles,
      repositoryRoot: options.repositoryRoot,
      yes: options.yes,
      dryRun: options.dryRun,
    });
    return {
      changedFiles: saved ? changedFiles : [],
      liftedUsages,
      unsupported,
    };
  });
