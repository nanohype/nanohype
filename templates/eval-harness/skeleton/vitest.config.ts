import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the assertion library, case helpers, and suite builder. The
      // runner, providers, reporters, and resilience layer are exercised
      // end-to-end against live providers.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/runner.ts",
        "src/providers/**",
        "src/reporters/**",
        "src/resilience/**",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 72,
        functions: 69,
        statements: 72,
        branches: 77,
      },
    },
  },
});
