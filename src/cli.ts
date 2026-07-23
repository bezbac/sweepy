#!/usr/bin/env node

import { createRequire } from "node:module";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { liftPropValue } from "./commands/lift-prop-value";
import { materializeProp } from "./commands/materialize-prop";
import { narrowProps } from "./commands/narrow-props";
import { replacePropValue } from "./commands/replace-prop-value";
import {
  InvalidWriteModeError,
  isSweepyError,
  type SweepyError,
} from "./errors";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  readonly version: string;
};

const formatCause = (cause: unknown) => {
  if (cause instanceof Error && cause.message.length > 0) return cause.message;
  return String(cause);
};

const formatValue = (value: string | number | undefined) =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

const assertUnreachable = (input: never): never => {
  throw new Error(`Unhandled command error: ${JSON.stringify(input)}`);
};

const formatCommandError = (error: SweepyError) => {
  if (error._tag === "ComponentFileNotFoundError") {
    return `Component file ${JSON.stringify(error.filePath)} was not found.`;
  }
  if (error._tag === "ComponentNotFoundError") {
    return `Component ${JSON.stringify(error.componentName)} was not found under ${JSON.stringify(error.searchRoot)}.`;
  }
  if (error._tag === "ComponentNotFoundInFileError") {
    return `Component ${JSON.stringify(error.componentName)} was not found in ${JSON.stringify(error.filePath)}.`;
  }
  if (error._tag === "AmbiguousComponentError") {
    return `Multiple components named ${JSON.stringify(error.componentName)} were found. Pass --component-file to select one.`;
  }
  if (error._tag === "NoSourceFilesError") {
    return `No TypeScript files were found under ${JSON.stringify(error.searchRoot)}.`;
  }
  if (error._tag === "PropNotFoundError") {
    return `Prop ${JSON.stringify(error.propName)} was not found in ${JSON.stringify(error.propsTypeName)}.`;
  }
  if (error._tag === "PropNotMaterializedError") {
    return `Prop ${JSON.stringify(`${error.propsTypeName}.${error.propName}`)} must be materialized first.`;
  }
  if (error._tag === "PropValueNotFoundError") {
    return `Value ${JSON.stringify(error.input)} is not valid for prop ${JSON.stringify(error.propName)}. Expected one of: ${error.allowedValues.map(formatValue).join(", ")}.`;
  }
  if (error._tag === "IdenticalSourceAndTargetPropError") {
    return `Source and target prop cannot both be ${JSON.stringify(error.propName)}.`;
  }
  if (error._tag === "PropsTypeNotFoundError") {
    return `Props type ${JSON.stringify(error.propsTypeName)} was not found.`;
  }
  if (error._tag === "PropsExtractionFailedError") {
    return `Could not extract props type ${JSON.stringify(error.propsTypeName)} in ${JSON.stringify(error.filePath)}.`;
  }
  if (error._tag === "UnsupportedComponentDeclarationError") {
    return `Component ${JSON.stringify(error.componentName)} uses an unsupported declaration.`;
  }
  if (error._tag === "NoSupportedPropValuesError") {
    return `No supported values were found for ${JSON.stringify(`${error.componentName}.${error.propName}`)}.`;
  }
  if (error._tag === "InvalidClassNameFragmentsError") {
    return `className concatenation requires string fragments, but received ${formatValue(error.left)} and ${formatValue(error.right)}.`;
  }
  if (error._tag === "ChangedSourceFileNotFoundError") {
    return `Could not generate a diff because changed file ${JSON.stringify(error.filePath)} is missing from the project.`;
  }
  if (error._tag === "SourceFileReadFailedError") {
    return `Could not read ${JSON.stringify(error.filePath)} for the diff: ${formatCause(error.cause)}`;
  }
  if (error._tag === "DiffGenerationFailedError") {
    return `Could not generate a diff for ${JSON.stringify(error.filePath)}: ${formatCause(error.cause)}`;
  }
  if (error._tag === "ProjectSaveFailedError") {
    return `Could not save changes: ${formatCause(error.cause)}`;
  }
  if (error._tag === "ConfirmationFailedError") {
    return `Could not read confirmation: ${formatCause(error.cause)}`;
  }
  if (error._tag === "InvalidWriteModeError") {
    return "--yes and --dry-run cannot be used together.";
  }
  if (error._tag === "UnexpectedFailureError") {
    return `Unexpected command failure: ${formatCause(error.cause)}`;
  }
  return assertUnreachable(error);
};

const withWriteModeValidation = <A, E, R>(
  options: { readonly yes: boolean; readonly dryRun: boolean },
  command: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    if (options.yes && options.dryRun) {
      return yield* new InvalidWriteModeError({
        yes: options.yes,
        dryRun: options.dryRun,
      });
    }
    return yield* command;
  });

const globalFlags = {
  component: Flag.string("component").pipe(
    Flag.withDefault("Button"),
    Flag.withDescription("Component name"),
  ),
  propsType: Flag.string("props-type").pipe(
    Flag.optional,
    Flag.withDescription(
      "Props type or interface name; defaults to <Component>Props",
    ),
  ),
  searchRoot: Flag.string("search-root").pipe(
    Flag.withDefault("src"),
    Flag.withDescription("Root directory to search for component usages"),
  ),
  tsconfig: Flag.string("tsconfig").pipe(
    Flag.withDefault("tsconfig.json"),
    Flag.withDescription("TypeScript config path"),
  ),
  componentFile: Flag.string("component-file").pipe(
    Flag.optional,
    Flag.withDescription(
      "Component definition file; auto-detected when omitted",
    ),
  ),
  yes: Flag.boolean("yes").pipe(
    Flag.withAlias("y"),
    Flag.withDescription("Save changes without confirmation"),
  ),
  dryRun: Flag.boolean("dry-run").pipe(
    Flag.withDescription("Print changes without updating files"),
  ),
};

const materializePropCommand = Command.make(
  "materialize-prop",
  {
    ...globalFlags,
    prop: Flag.string("prop").pipe(Flag.withDescription("Prop to materialize")),
  },
  (options) =>
    withWriteModeValidation(
      options,
      materializeProp({
        repositoryRoot: process.cwd(),
        componentName: options.component,
        propsTypeName: Option.getOrElse(
          options.propsType,
          () => `${options.component}Props`,
        ),
        searchRoot: options.searchRoot,
        tsconfigPath: options.tsconfig,
        componentFile: Option.getOrUndefined(options.componentFile),
        propName: options.prop,
        yes: options.yes,
        dryRun: options.dryRun,
      }),
    ),
).pipe(
  Command.withDescription(
    "Materialize a component prop type from its static usages",
  ),
);

const replacePropValueCommand = Command.make(
  "replace-prop-value",
  {
    ...globalFlags,
    sourceProp: Flag.string("source-prop").pipe(
      Flag.withDescription("Prop to replace from"),
    ),
    sourceValue: Flag.string("source-value").pipe(
      Flag.withDescription("Value to replace from"),
    ),
    targetProp: Flag.string("target-prop").pipe(
      Flag.withDescription("Prop to replace to"),
    ),
    targetValue: Flag.string("target-value").pipe(
      Flag.withDescription("Value to replace to"),
    ),
  },
  (options) =>
    withWriteModeValidation(
      options,
      replacePropValue({
        repositoryRoot: process.cwd(),
        componentName: options.component,
        propsTypeName: Option.getOrElse(
          options.propsType,
          () => `${options.component}Props`,
        ),
        searchRoot: options.searchRoot,
        tsconfigPath: options.tsconfig,
        componentFile: Option.getOrUndefined(options.componentFile),
        sourcePropName: options.sourceProp,
        sourceValue: options.sourceValue,
        targetPropName: options.targetProp,
        targetValue: options.targetValue,
        yes: options.yes,
        dryRun: options.dryRun,
      }),
    ),
).pipe(Command.withDescription("Replace one static component prop value"));

const liftPropValueCommand = Command.make(
  "lift-prop-value",
  {
    ...globalFlags,
    sourceProp: Flag.string("source-prop").pipe(
      Flag.withDescription("Prop to lift"),
    ),
    sourceValue: Flag.string("source-value").pipe(
      Flag.withDescription("Value to lift"),
    ),
    wrapper: Flag.string("wrapper").pipe(
      Flag.withDefault("div"),
      Flag.withDescription("Wrapper component or tag"),
    ),
  },
  (options) =>
    withWriteModeValidation(
      options,
      liftPropValue({
        repositoryRoot: process.cwd(),
        componentName: options.component,
        propsTypeName: Option.getOrElse(
          options.propsType,
          () => `${options.component}Props`,
        ),
        searchRoot: options.searchRoot,
        tsconfigPath: options.tsconfig,
        componentFile: Option.getOrUndefined(options.componentFile),
        sourcePropName: options.sourceProp,
        sourceValue: options.sourceValue,
        wrapperName: options.wrapper,
        yes: options.yes,
        dryRun: options.dryRun,
      }),
    ),
).pipe(Command.withDescription("Lift one static prop value to a wrapper"));

const narrowPropsCommand = Command.make(
  "narrow-props",
  {
    ...globalFlags,
  },
  (options) =>
    withWriteModeValidation(
      options,
      narrowProps({
        repositoryRoot: process.cwd(),
        componentName: options.component,
        propsTypeName: Option.getOrElse(
          options.propsType,
          () => `${options.component}Props`,
        ),
        searchRoot: options.searchRoot,
        tsconfigPath: options.tsconfig,
        componentFile: Option.getOrUndefined(options.componentFile),
        yes: options.yes,
        dryRun: options.dryRun,
      }),
    ),
).pipe(Command.withDescription("Narrow component props to their used keys"));

const rootCommand = Command.make("sweepy").pipe(
  Command.withSubcommands([
    materializePropCommand,
    replacePropValueCommand,
    liftPropValueCommand,
    narrowPropsCommand,
  ]),
);

const main = Command.run(rootCommand, { version: packageJson.version }).pipe(
  Effect.tapError((error) =>
    isSweepyError(error)
      ? Console.error(formatCommandError(error))
      : Effect.void,
  ),
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(main, { disableErrorReporting: true });
