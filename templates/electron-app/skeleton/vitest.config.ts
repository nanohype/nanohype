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
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the provider registry — the only pure in-process logic.
      // Main-process wiring (ipc, preload, config), the renderer UI, and SDK
      // providers need Electron or live SDKs.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/main/bootstrap.ts",
        "src/main/config.ts",
        "src/main/ipc-handlers.ts",
        "src/main/preload.ts",
        "src/main/providers/anthropic.ts",
        "src/main/providers/openai.ts",
        "src/renderer/**",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // The floor published in nanohype/standards/testing-rubric.json. A
      // scaffolded project starts held to the same bar it will be graded
      // against; raise these as the suite grows, never lower them.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
  },
});
