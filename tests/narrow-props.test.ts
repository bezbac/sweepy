import { promises as fs } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "@effect/vitest";

import {
  assertFixtureFiles,
  createReferenceProject,
  readProjectFile,
  runCliInProject,
} from "./test-utils.js";

const narrowArgs = ["narrow-props", "--component", "NarrowButton"] as const;

describe("narrow-props", () => {
  it("narrows and flattens inherited props from JSX usage", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [...narrowArgs, "--yes"]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(projectRoot, "narrow-props/narrow-button");
  });

  it("extracts and narrows direct forwardRef props", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [
      "narrow-props",
      "--component",
      "ForwardRefButton",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(projectRoot, "narrow-props/forward-ref-button");
  });

  it("auto-detects a typed memo component", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [
      "narrow-props",
      "--component",
      "MemoButton",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(projectRoot, "narrow-props/memo-button");
  });

  it("detects a typed memo component at an explicit path", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [
      "narrow-props",
      "--component",
      "MemoButton",
      "--component-file",
      "src/components/ui/memo-button.tsx",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(projectRoot, "narrow-props/memo-button");
  });

  it("narrows inherited interface props", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [
      "narrow-props",
      "--component",
      "NarrowLink",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(projectRoot, "narrow-props/narrow-link");
  });

  it("removes an inherited alias part when none of its props are used", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [
      "narrow-props",
      "--component",
      "EmptyInheritedAlias",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(projectRoot, "narrow-props/empty-inherited-alias");
  });

  it("removes inherited interface props when none are used", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [
      "narrow-props",
      "--component",
      "EmptyInheritedInterface",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(
      projectRoot,
      "narrow-props/empty-inherited-interface",
    );
  });

  it("uses an empty type when no standalone inherited props are used", async () => {
    const projectRoot = await createReferenceProject();

    const result = await runCliInProject(projectRoot, [
      "narrow-props",
      "--component",
      "EmptyInheritedOnly",
      "--yes",
    ]);

    assert.strictEqual(result.exitCode, 0);
    await assertFixtureFiles(projectRoot, "narrow-props/empty-inherited-only");
  });

  it("leaves the definition unchanged for dynamic spreads", async () => {
    const projectRoot = await createReferenceProject();
    const componentPath = "src/components/ui/narrow-button.tsx";
    const usagePath = path.join(
      projectRoot,
      "src/features/dashboard/narrow-buttons.tsx",
    );
    const before = await readProjectFile(projectRoot, componentPath);
    const usage = await fs.readFile(usagePath, "utf8");
    await fs.writeFile(
      usagePath,
      usage
        .replace(
          "export function NarrowButtons() {",
          "export function NarrowButtons({ props }: { props: Record<string, unknown> }) {",
        )
        .replace(
          '<Action variant="secondary" aria-label="Cancel" />',
          '<Action variant="secondary" aria-label="Cancel" />\n      <NarrowButton {...props} />',
        ),
    );

    const result = await runCliInProject(projectRoot, [...narrowArgs, "--yes"]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(
      await readProjectFile(projectRoot, componentPath),
      before,
    );
  });

  it("leaves files unchanged when confirmation is declined", async () => {
    const projectRoot = await createReferenceProject();
    const componentPath = "src/components/ui/narrow-button.tsx";
    const before = await readProjectFile(projectRoot, componentPath);

    const result = await runCliInProject(projectRoot, narrowArgs, "n\n");

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(
      await readProjectFile(projectRoot, componentPath),
      before,
    );
  });

  it("prints a diff without writing in dry-run mode", async () => {
    const projectRoot = await createReferenceProject();
    const componentPath = "src/components/ui/narrow-button.tsx";
    const before = await readProjectFile(projectRoot, componentPath);

    const result = await runCliInProject(projectRoot, [
      ...narrowArgs,
      "--dry-run",
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.include(result.stdout, `--- a/${componentPath}`);
    assert.include(result.stdout, `+++ b/${componentPath}`);
    assert.strictEqual(
      await readProjectFile(projectRoot, componentPath),
      before,
    );
  });

  it("leaves shared prop declarations unchanged", async () => {
    const projectRoot = await createReferenceProject();
    const componentPath = "src/components/ui/narrow-button.tsx";
    const absolutePath = path.join(projectRoot, componentPath);
    const before = await readProjectFile(projectRoot, componentPath);
    await fs.writeFile(
      absolutePath,
      `${before}\nexport function OtherNarrowButton(props: NarrowButtonProps) {\n  return <button {...props} />;\n}\n`,
    );
    const withSharedType = await readProjectFile(projectRoot, componentPath);

    const result = await runCliInProject(projectRoot, [...narrowArgs, "--yes"]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(
      await readProjectFile(projectRoot, componentPath),
      withSharedType,
    );
  });

  it("leaves definitions unchanged for local component aliases", async () => {
    const projectRoot = await createReferenceProject();
    const componentPath = "src/components/ui/narrow-button.tsx";
    const usagePath = path.join(
      projectRoot,
      "src/features/dashboard/narrow-buttons.tsx",
    );
    const before = await readProjectFile(projectRoot, componentPath);
    const usage = await fs.readFile(usagePath, "utf8");
    await fs.writeFile(
      usagePath,
      usage
        .replace(
          "const sharedButtonProps = {",
          "const LocalButton = NarrowButton;\n\nconst sharedButtonProps = {",
        )
        .replace(
          "<BarrelButton autoFocus />",
          '<BarrelButton autoFocus />\n      <LocalButton formAction="/alias" />',
        ),
    );

    const result = await runCliInProject(projectRoot, [...narrowArgs, "--yes"]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(
      await readProjectFile(projectRoot, componentPath),
      before,
    );
  });

  it("leaves escaped rest props unchanged", async () => {
    const projectRoot = await createReferenceProject();
    const componentPath = "src/components/ui/narrow-button.tsx";
    const absolutePath = path.join(projectRoot, componentPath);
    const before = await readProjectFile(projectRoot, componentPath);
    await fs.writeFile(
      absolutePath,
      before
        .replace("  return <button", "  consumeProps(props);\n  return <button")
        .replace(
          "export function NarrowButton(",
          "declare function consumeProps(props: object): void;\n\nexport function NarrowButton(",
        ),
    );
    const withEscapedProps = await readProjectFile(projectRoot, componentPath);

    const result = await runCliInProject(projectRoot, [...narrowArgs, "--yes"]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(
      await readProjectFile(projectRoot, componentPath),
      withEscapedProps,
    );
  });

  it("is idempotent after narrowing", async () => {
    const projectRoot = await createReferenceProject();
    const args = [...narrowArgs, "--yes"] as const;
    const first = await runCliInProject(projectRoot, args);
    assert.strictEqual(first.exitCode, 0);

    const second = await runCliInProject(projectRoot, args);

    assert.strictEqual(second.exitCode, 0);
    await assertFixtureFiles(projectRoot, "narrow-props/narrow-button");
  });
});
