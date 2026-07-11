import { promises as fs } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "@effect/vitest";

import {
  assertFixtureFile,
  assertFixtureFiles,
  createReferenceProject,
  readProjectFile,
  runCliInProject,
} from "./test-utils.js";

describe("materialize-prop", () => {
  it("materializes Button className", async () => {
    const projectRoot = await createReferenceProject();

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--yes",
    ]);

    assert.strictEqual(exitCode, 0);
    await assertFixtureFiles(projectRoot, "materialize-prop/button-class-name");
  });

  it("materializes Button variant", async () => {
    const projectRoot = await createReferenceProject();

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "variant",
      "--yes",
    ]);

    assert.strictEqual(exitCode, 0);
    await assertFixtureFiles(projectRoot, "materialize-prop/button-variant");
  });

  it("materializes Card className and extracts its inline props", async () => {
    const projectRoot = await createReferenceProject();

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Card",
      "--prop",
      "className",
      "--yes",
    ]);

    assert.strictEqual(exitCode, 0);
    await assertFixtureFiles(projectRoot, "materialize-prop/card-class-name");
  });

  it("materializes Logo size with component-derived props defaults", async () => {
    const projectRoot = await createReferenceProject();

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Logo",
      "--prop",
      "size",
      "--yes",
    ]);

    assert.strictEqual(exitCode, 0);
    await assertFixtureFiles(projectRoot, "materialize-prop/logo-size");
  });

  it("leaves files byte-for-byte unchanged when confirmation is declined", async () => {
    const projectRoot = await createReferenceProject();
    const changedPaths = [
      "src/components/ui/button.tsx",
      "src/app/page.tsx",
      "src/features/billing/plan-card.tsx",
    ];
    const before = await Promise.all(
      changedPaths.map((file) => readProjectFile(projectRoot, file)),
    );

    const { exitCode } = await runCliInProject(
      projectRoot,
      ["materialize-prop", "--component", "Button", "--prop", "className"],
      "n\n",
    );

    assert.strictEqual(exitCode, 0);
    const after = await Promise.all(
      changedPaths.map((file) => readProjectFile(projectRoot, file)),
    );
    assert.deepStrictEqual(after, before);
  });

  it("is idempotent after the first rewrite", async () => {
    const projectRoot = await createReferenceProject();
    const args = [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--yes",
    ] as const;
    const first = await runCliInProject(projectRoot, args);
    assert.strictEqual(first.exitCode, 0);

    const second = await runCliInProject(projectRoot, args);

    assert.strictEqual(second.exitCode, 0);
    await assertFixtureFiles(projectRoot, "materialize-prop/button-class-name");
  });

  it("fails without writing when the component cannot be found", async () => {
    const projectRoot = await createReferenceProject();
    const pagePath = "src/app/page.tsx";
    const before = await readProjectFile(projectRoot, pagePath);

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Missing",
      "--prop",
      "className",
      "--yes",
    ]);

    assert.notStrictEqual(exitCode, 0);
    assert.strictEqual(await readProjectFile(projectRoot, pagePath), before);
  });

  it("accepts an interactive confirmation", async () => {
    const projectRoot = await createReferenceProject();

    const { exitCode } = await runCliInProject(
      projectRoot,
      ["materialize-prop", "--component", "Button", "--prop", "className"],
      "yes\n",
    );

    assert.strictEqual(exitCode, 0);
    await assertFixtureFiles(projectRoot, "materialize-prop/button-class-name");
  });

  it("reports a missing prop without writing", async () => {
    const projectRoot = await createReferenceProject();
    const buttonPath = "src/components/ui/button.tsx";
    const before = await readProjectFile(projectRoot, buttonPath);

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "missing",
      "--yes",
    ]);

    assert.notStrictEqual(exitCode, 0);
    assert.strictEqual(await readProjectFile(projectRoot, buttonPath), before);
  });

  it("reports an empty search root", async () => {
    const projectRoot = await createReferenceProject();
    await fs.mkdir(path.join(projectRoot, "empty"));

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--search-root",
      "empty",
      "--yes",
    ]);

    assert.notStrictEqual(exitCode, 0);
  });

  it("loads an explicit component file outside the usage search root", async () => {
    const projectRoot = await createReferenceProject();
    const externalRoot = path.join(projectRoot, "external");
    await fs.mkdir(externalRoot);
    await fs.copyFile(
      path.join(projectRoot, "src/components/ui/button.tsx"),
      path.join(externalRoot, "button.tsx"),
    );

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--component-file",
      "external/button.tsx",
      "--yes",
    ]);

    assert.strictEqual(exitCode, 0);
    await assertFixtureFile(
      projectRoot,
      "materialize-prop/button-class-name",
      "src/components/ui/button.tsx",
      "external/button.tsx",
    );
  });
});
