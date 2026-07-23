import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const builtCliPath = path.join(repositoryRoot, "dist/cli.js");

const referenceRoot = path.join(repositoryRoot, "reference");
const fixturesRoot = path.join(repositoryRoot, "tests/fixtures");
export const testProjectsRoot = path.join(repositoryRoot, ".test-projects");

export const createReferenceProject = async () => {
  await fs.mkdir(testProjectsRoot, { recursive: true });
  const projectRoot = await fs.mkdtemp(
    path.join(testProjectsRoot, "reference-"),
  );
  await fs.cp(referenceRoot, projectRoot, {
    recursive: true,
    filter: (source) => path.basename(source) !== "node_modules",
  });
  await fs.symlink(
    path.join(referenceRoot, "node_modules"),
    path.join(projectRoot, "node_modules"),
    "dir",
  );
  return projectRoot;
};

export const runCli = (args: ReadonlyArray<string>) =>
  execFileAsync(process.execPath, [builtCliPath, ...args], {
    cwd: repositoryRoot,
  });

export const runCliInProject = async (
  projectRoot: string,
  args: ReadonlyArray<string>,
  input?: string,
) =>
  new Promise<{
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
  }>((resolve, reject) => {
    const child = spawn(process.execPath, [builtCliPath, ...args], {
      cwd: projectRoot,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(input);
  });

export const readProjectFile = (projectRoot: string, relativePath: string) =>
  fs.readFile(path.join(projectRoot, relativePath), "utf8");

const getFixtureFiles = async (
  directory: string,
  relativeDirectory = "",
): Promise<ReadonlyArray<string>> => {
  const entries = await fs.readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  });
  const files: Array<string> = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getFixtureFiles(directory, relativePath)));
      continue;
    }
    files.push(relativePath);
  }

  return files;
};

export const assertFixtureFiles = async (
  projectRoot: string,
  fixture: string,
) => {
  const fixtureRoot = path.join(fixturesRoot, fixture);
  const files = await getFixtureFiles(fixtureRoot);

  for (const relativePath of files) {
    await assertFixtureFile(projectRoot, fixture, relativePath);
  }
};

export const assertFixtureFile = async (
  projectRoot: string,
  fixture: string,
  fixturePath: string,
  projectPath = fixturePath,
) => {
  const [actual, expected] = await Promise.all([
    readProjectFile(projectRoot, projectPath),
    fs.readFile(path.join(fixturesRoot, fixture, fixturePath), "utf8"),
  ]);
  assert.equal(actual, expected, projectPath);
};
