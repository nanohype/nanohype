import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the baseline store, reporter, runner, assertions, and provider
      // registry. SDK providers and wiring (bootstrap, config, logger, barrels,
      // type-only modules) are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/ci-eval/bootstrap.ts",
        "src/ci-eval/config.ts",
        "src/ci-eval/logger.ts",
        "src/ci-eval/providers/anthropic.ts",
        "src/ci-eval/providers/openai.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 55,
        functions: 72,
        statements: 55,
        branches: 85,
      },
    },
  },
});
