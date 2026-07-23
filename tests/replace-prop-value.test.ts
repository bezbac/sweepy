import { assert, describe, it } from "@effect/vitest";

import {
  assertFixtureFiles,
  createReferenceProject,
  readProjectFile,
  runCliInProject,
} from "./test-utils.js";

const replaceArgs = [
  "replace-prop-value",
  "--component",
  "Icon",
  "--source-prop",
  "className",
  "--source-value",
  "h-8 w-8",
  "--target-prop",
  "size",
  "--target-value",
  "32",
] as const;

describe("replace-prop-value", () => {
  it("replaces static values, matching targets, and aliased imports", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [
      ...replaceArgs,
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(
      projectRoot,
      "replace-prop-value/icon-class-name-to-size",
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

    const result = await runCliInProject(projectRoot, replaceArgs, "n\n");

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
      ...replaceArgs,
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
      "replace-prop-value",
      "--component",
      "Button",
      "--source-prop",
      "className",
      "--source-value",
      "px-2 py-1",
      "--target-prop",
      "size",
      "--target-value",
      "16",
      "--yes",
    ]);

    assert.notStrictEqual(result.exitCode, 0);
    assert.include(result.stdout, "must be materialized first");
    assert.strictEqual(await readProjectFile(projectRoot, buttonPath), before);
  });

  it("is idempotent after the first rewrite", async () => {
    const projectRoot = await createReferenceProject();
    const args = [...replaceArgs, "--yes"] as const;
    const first = await runCliInProject(projectRoot, args);
    assert.strictEqual(first.exitCode, 0);

    const second = await runCliInProject(projectRoot, args);

    assert.notStrictEqual(second.exitCode, 0);
    assert.include(second.stdout, "is not in className");
    await assertFixtureFiles(
      projectRoot,
      "replace-prop-value/icon-class-name-to-size",
    );
  });
});
