import { assert, describe, it } from "@effect/vitest";

import {
  assertFixtureFiles,
  createReferenceProject,
  readProjectFile,
  runCliInProject,
} from "./test-utils.js";

const liftArgs = [
  "lift-prop-value",
  "--component",
  "Icon",
  "--source-prop",
  "className",
  "--source-value",
  "h-8 w-8",
] as const;

describe("lift-prop-value", () => {
  it("lifts self-closing, paired, and aliased component usages", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [...liftArgs, "--yes"]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(
      projectRoot,
      "lift-prop-value/icon-class-name-to-div",
    );
  });

  it("leaves files unchanged when confirmation is declined", async () => {
    const projectRoot = await createReferenceProject();
    const paths = [
      "src/components/ui/icon.tsx",
      "src/features/dashboard/icons.tsx",
    ];
    const before = await Promise.all(
      paths.map((file) => readProjectFile(projectRoot, file)),
    );

    const result = await runCliInProject(projectRoot, liftArgs, "n\n");

    assert.strictEqual(result.exitCode, 0);
    const after = await Promise.all(
      paths.map((file) => readProjectFile(projectRoot, file)),
    );
    assert.deepStrictEqual(after, before);
  });

  it("prints a diff without writing in dry-run mode", async () => {
    const projectRoot = await createReferenceProject();
    const iconPath = "src/components/ui/icon.tsx";
    const before = await readProjectFile(projectRoot, iconPath);

    const result = await runCliInProject(projectRoot, [
      ...liftArgs,
      "--dry-run",
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.include(result.stdout, `--- a/${iconPath}`);
    assert.include(result.stdout, `+++ b/${iconPath}`);
    assert.strictEqual(await readProjectFile(projectRoot, iconPath), before);
  });

  it("rejects a loose source prop without writing", async () => {
    const projectRoot = await createReferenceProject();
    const buttonPath = "src/components/ui/button.tsx";
    const before = await readProjectFile(projectRoot, buttonPath);

    const result = await runCliInProject(projectRoot, [
      "lift-prop-value",
      "--component",
      "Button",
      "--source-prop",
      "className",
      "--source-value",
      "px-2 py-1",
      "--yes",
    ]);

    assert.notStrictEqual(result.exitCode, 0);
    assert.include(
      result.stderr,
      'Prop "ButtonProps.className" must be materialized first.',
    );
    assert.strictEqual(await readProjectFile(projectRoot, buttonPath), before);
  });

  it("renders numeric values on a component wrapper", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [
      "lift-prop-value",
      "--component",
      "Icon",
      "--source-prop",
      "size",
      "--source-value",
      "32",
      "--wrapper",
      "Wrapper",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(
      projectRoot,
      "lift-prop-value/icon-size-to-wrapper",
    );
  });
});
