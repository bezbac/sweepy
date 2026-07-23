import { assert, describe, it } from "@effect/vitest";

import {
  createReferenceProject,
  runCli,
  runCliInProject,
} from "./test-utils.js";

describe("compiled CLI", () => {
  it("shows help", async () => {
    const { stdout } = await runCli(["--help"]);

    assert.include(stdout, "sweepy <subcommand> [flags]");
    assert.include(stdout, "materialize-prop");
    assert.include(stdout, "replace-prop-value");
    assert.include(stdout, "lift-prop-value");
    assert.include(stdout, "narrow-props");
  });

  it("reads its version from package.json", async () => {
    const { stdout } = await runCli(["--version"]);

    assert.include(stdout, "0.1.0");
  });

  it("reports invalid commands", async () => {
    const projectRoot = await createReferenceProject();
    const result = await runCliInProject(projectRoot, ["missing-command"]);

    assert.notStrictEqual(result.exitCode, 0);
    assert.include(result.stderr, 'Unknown subcommand "missing-command"');
  });
});
