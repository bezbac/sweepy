import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/cli.ts",
  external: [/^[^./]/],
  output: {
    file: "dist/cli.js",
    format: "esm",
    sourcemap: true,
    cleanDir: true,
  },
});
