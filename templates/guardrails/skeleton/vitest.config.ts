import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the filter pipeline and the filters themselves. Wiring (bootstrap,
      // logger, barrels, type-only modules) carries no logic to gate.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/logger.ts",
        "src/guardrails/bootstrap.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 80,
        statements: 85,
        branches: 85,
      },
    },
  },
});
