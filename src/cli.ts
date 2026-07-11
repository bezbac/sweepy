#!/usr/bin/env node

import { createRequire } from "node:module";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { materializeProp } from "./commands/materialize-prop.js";

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

const rootCommand = Command.make("sweepy").pipe(
  Command.withSubcommands([materializePropCommand]),
);

Command.run(rootCommand, { version: packageJson.version }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
