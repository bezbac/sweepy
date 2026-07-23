#!/usr/bin/env node

import { createRequire } from "node:module";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { materializeProp } from "./commands/materialize-prop";
import { liftPropValue } from "./commands/lift-prop-value";
import { narrowProps } from "./commands/narrow-props";
import { replacePropValue } from "./commands/replace-prop-value";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  readonly version: string;
};

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
};

const materializePropCommand = Command.make(
  "materialize-prop",
  {
    ...globalFlags,
    prop: Flag.string("prop").pipe(Flag.withDescription("Prop to materialize")),
    yes: Flag.boolean("yes").pipe(
      Flag.withAlias("y"),
      Flag.withDescription("Save changes without confirmation"),
    ),
  },
  (options) =>
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
    }),
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
    yes: Flag.boolean("yes").pipe(
      Flag.withAlias("y"),
      Flag.withDescription("Save changes without confirmation"),
    ),
  },
  (options) =>
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
    }),
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
    yes: Flag.boolean("yes").pipe(
      Flag.withAlias("y"),
      Flag.withDescription("Save changes without confirmation"),
    ),
  },
  (options) =>
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
    }),
).pipe(Command.withDescription("Lift one static prop value to a wrapper"));

const narrowPropsCommand = Command.make(
  "narrow-props",
  {
    ...globalFlags,
    yes: Flag.boolean("yes").pipe(
      Flag.withAlias("y"),
      Flag.withDescription("Save changes without confirmation"),
    ),
  },
  (options) =>
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
    }),
).pipe(Command.withDescription("Narrow component props to their used keys"));

const rootCommand = Command.make("sweepy").pipe(
  Command.withSubcommands([
    materializePropCommand,
    replacePropValueCommand,
    liftPropValueCommand,
    narrowPropsCommand,
  ]),
);

Command.run(rootCommand, { version: packageJson.version }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
