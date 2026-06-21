import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/", "node_modules/"],
  },
  {
    // Node build/config scripts (esbuild.config.mjs, vite/vitest config).
    files: ["**/*.mjs", "**/*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
);
