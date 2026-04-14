import { defineConfig } from "vitest/config";

/**
 * Dedicated test config so vitest discovers tests across the whole
 * project. The sibling vite.config.ts scopes its root to `src/renderer`
 * for the renderer build, which would hide unit tests under `src/main`
 * or `src/__tests__` from vitest.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
