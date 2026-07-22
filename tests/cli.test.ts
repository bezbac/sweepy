import { assert, describe, it } from "@effect/vitest";

import { runCli } from "./test-utils.js";

describe("compiled CLI", () => {
  it("shows help", async () => {
    const { stdout } = await runCli(["--help"]);

    assert.include(stdout, "sweepy <subcommand> [flags]");
    assert.include(stdout, "materialize-prop");
    assert.include(stdout, "replace-prop-value");
  });

  it("reads its version from package.json", async () => {
    const { stdout } = await runCli(["--version"]);

    assert.include(stdout, "0.1.0");
  });
});
