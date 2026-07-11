import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

import { testProjectsRoot } from "./test-utils.js";

const execFileAsync = promisify(execFile);

export default async function globalSetup() {
  await fs.rm(testProjectsRoot, { recursive: true, force: true });
  await execFileAsync("pnpm", ["build"], {
    cwd: new URL("..", import.meta.url),
  });
  return () => fs.rm(testProjectsRoot, { recursive: true, force: true });
}
