import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [".memsearch/**", ".vite-hooks/**", "AGENTS.md"],
    overrides: [
      {
        files: ["src/**", "app.tsx", "scripts/**"],
        options: { singleQuote: true, tabWidth: 4, printWidth: 120 },
      },
    ],
  },
  test: { pool: "forks", fileParallelism: false },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
