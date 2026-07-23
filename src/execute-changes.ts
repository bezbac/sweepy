import { promises as fs } from "node:fs";
import path from "node:path";

import { createTwoFilesPatch } from "diff";
import { Console, Effect, Schema } from "effect";
import type { Project } from "ts-morph";

import { confirm } from "./confirm";

class ExecuteChangesError extends Schema.TaggedErrorClass<ExecuteChangesError>(
  "sweepy/ExecuteChangesError",
)("ExecuteChangesError", {
  message: Schema.String,
}) {}

const toExecuteChangesError = (cause: unknown) =>
  new ExecuteChangesError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

const colorizeDiff = (diff: string) => {
  if (
    !process.stdout.isTTY ||
    process.env.NO_COLOR !== undefined ||
    !process.stdout.hasColors()
  ) {
    return diff;
  }

  return diff
    .split("\n")
    .map((line) => {
      if (line.startsWith("+")) return `\u001B[32m${line}\u001B[39m`;
      if (line.startsWith("-")) return `\u001B[31m${line}\u001B[39m`;
      if (line.startsWith("@@")) return `\u001B[36m${line}\u001B[39m`;
      return line;
    })
    .join("\n");
};

export const executeChanges = ({
  project,
  changedFiles,
  repositoryRoot,
  yes,
  dryRun,
}: {
  readonly project: Project;
  readonly changedFiles: ReadonlyArray<string>;
  readonly repositoryRoot: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    if (dryRun) {
      const patches = yield* Effect.tryPromise({
        try: () =>
          Promise.all(
            changedFiles.map(async (file) => {
              const absolutePath = path.resolve(repositoryRoot, file);
              const sourceFile = project.getSourceFile(absolutePath);
              if (sourceFile === undefined) {
                throw new ExecuteChangesError({
                  message: `Changed source file not found: ${file}`,
                });
              }
              const original = await fs.readFile(absolutePath, "utf8");
              const patch = createTwoFilesPatch(
                `a/${file}`,
                `b/${file}`,
                original,
                sourceFile.getFullText(),
                undefined,
                undefined,
                {
                  context: 3,
                  headerOptions: {
                    includeIndex: false,
                    includeUnderline: false,
                    includeFileHeaders: true,
                  },
                },
              );
              return patch;
            }),
          ),
        catch: toExecuteChangesError,
      });
      yield* Console.log(
        `\nDry run: no files updated.\n\nDiff:\n\n${colorizeDiff(patches.join("\n"))}`,
      );
      return false;
    }

    if (!yes) {
      const shouldSave = yield* confirm(
        `Files to update:\n${changedFiles.map((file) => `  ${file}`).join("\n")}\nSave these changes?`,
      );
      if (!shouldSave) {
        yield* Console.log("Changes discarded.");
        return false;
      }
    }

    yield* Effect.tryPromise({
      try: () => project.save(),
      catch: toExecuteChangesError,
    });
    yield* Console.log(`Updated ${changedFiles.length} file(s).`);
    return true;
  });
