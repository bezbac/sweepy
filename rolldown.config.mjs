import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/cli.ts",
  external: [/^node:/],
  platform: "node",
  output: {
    banner:
      "const __filename = import.meta.filename;\nconst __dirname = import.meta.dirname;",
    file: "dist/cli.js",
    format: "esm",
    sourcemap: true,
    cleanDir: true,
  },
});
