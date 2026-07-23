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

  it("leaves mutable object properties unsupported", async () => {
    const projectRoot = await createReferenceProject();
    const overviewPath = "src/features/dashboard/overview.tsx";
    const overview = await readProjectFile(projectRoot, overviewPath);
    await fs.writeFile(
      path.join(projectRoot, overviewPath),
      overview.replace(
        '  overviewButton: "bg-gray-100",\n};',
        '  overviewButton: "bg-gray-100",\n};\nstyles.overviewButton = "bg-gray-200";',
      ),
    );

    const result = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    const button = await readProjectFile(
      projectRoot,
      "src/components/ui/button.tsx",
    );
    assert.notInclude(button, '"bg-gray-100"');
    assert.notInclude(button, '"bg-gray-200"');
  });

  it("does not narrow helpers with executable statements", async () => {
    const projectRoot = await createReferenceProject();
    const planCardPath = "src/features/billing/plan-card.tsx";
    const planCard = await readProjectFile(projectRoot, planCardPath);
    await fs.writeFile(
      path.join(projectRoot, planCardPath),
      planCard.replace(
        'function getDynamicClass() {\n  return "text-pro";\n}',
        'function getDynamicClass() {\n  console.log("resolve class");\n  return "text-pro";\n}',
      ),
    );

    const result = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    const [button, updatedPlanCard] = await Promise.all([
      readProjectFile(projectRoot, "src/components/ui/button.tsx"),
      readProjectFile(projectRoot, planCardPath),
    ]);
    assert.notInclude(button, '"text-pro"');
    assert.notInclude(updatedPlanCard, 'return "text-pro" as const;');
  });

  it("does not edit helpers from an unsupported expression", async () => {
    const projectRoot = await createReferenceProject();
    const overviewPath = "src/features/dashboard/overview.tsx";
    const overview = await readProjectFile(projectRoot, overviewPath);
    await fs.writeFile(
      path.join(projectRoot, overviewPath),
      overview
        .replace(
          'function getIconClass() {\n  return "text-blue-500";\n}',
          'function getIconClass() {\n  return "text-blue-500";\n}\n\nfunction getDeferredClass() {\n  return "deferred-class";\n}',
        )
        .replace(
          '<Button className="flex items-center">Dashboard</Button>',
          '<Button className="flex items-center">Dashboard</Button>\n      <Button className={`${getDeferredClass()} ${window.location.hash}`}>Unsafe</Button>',
        ),
    );

    const result = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    const [button, updatedOverview] = await Promise.all([
      readProjectFile(projectRoot, "src/components/ui/button.tsx"),
      readProjectFile(projectRoot, overviewPath),
    ]);
    assert.notInclude(button, '"deferred-class"');
    assert.notInclude(updatedOverview, 'return "deferred-class" as const;');
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

  it("materializes inherited props on a forwardRef component", async () => {
    const projectRoot = await createReferenceProject();

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "ForwardRefButton",
      "--prop",
      "className",
      "--yes",
    ]);

    assert.strictEqual(exitCode, 0);
    await assertFixtureFiles(
      projectRoot,
      "materialize-prop/forward-ref-button-class-name",
    );
  });

  it("materializes a prop on an auto-detected typed memo component", async () => {
    const projectRoot = await createReferenceProject();

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "MemoButton",
      "--prop",
      "variant",
      "--yes",
    ]);

    assert.strictEqual(exitCode, 0);
    await assertFixtureFiles(
      projectRoot,
      "materialize-prop/memo-button-variant",
    );
  });

  it("materializes a prop on a typed memo component at an explicit path", async () => {
    const projectRoot = await createReferenceProject();

    const { exitCode } = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "MemoButton",
      "--prop",
      "variant",
      "--component-file",
      "src/components/ui/memo-button.tsx",
      "--yes",
    ]);

    assert.strictEqual(exitCode, 0);
    await assertFixtureFiles(
      projectRoot,
      "materialize-prop/memo-button-variant",
    );
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

  it("prints a diff without writing in dry-run mode", async () => {
    const projectRoot = await createReferenceProject();
    const buttonPath = "src/components/ui/button.tsx";
    const before = await readProjectFile(projectRoot, buttonPath);

    const result = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--dry-run",
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.include(result.stdout, `--- a/${buttonPath}`);
    assert.include(result.stdout, `+++ b/${buttonPath}`);
    assert.strictEqual(await readProjectFile(projectRoot, buttonPath), before);
  });

  it("rejects --yes and --dry-run together", async () => {
    const projectRoot = await createReferenceProject();
    const result = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--yes",
      "--dry-run",
    ]);

    assert.notStrictEqual(result.exitCode, 0);
    assert.include(
      result.stderr,
      "--yes and --dry-run cannot be used together.",
    );
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

    const result = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Missing",
      "--prop",
      "className",
      "--yes",
    ]);

    assert.notStrictEqual(result.exitCode, 0);
    assert.include(
      result.stderr,
      'Component "Missing" was not found under "src".',
    );
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

    const result = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "missing",
      "--yes",
    ]);

    assert.notStrictEqual(result.exitCode, 0);
    assert.include(
      result.stderr,
      'No supported values were found for "Button.missing".',
    );
    assert.strictEqual(await readProjectFile(projectRoot, buttonPath), before);
  });

  it("reports an empty search root", async () => {
    const projectRoot = await createReferenceProject();
    await fs.mkdir(path.join(projectRoot, "empty"));

    const result = await runCliInProject(projectRoot, [
      "materialize-prop",
      "--component",
      "Button",
      "--prop",
      "className",
      "--search-root",
      "empty",
      "--yes",
    ]);

    assert.notStrictEqual(result.exitCode, 0);
    assert.include(
      result.stderr,
      'No TypeScript files were found under "empty".',
    );
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
