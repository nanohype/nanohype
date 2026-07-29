import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      enabled: true,
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
      // Below the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). These are the measured
      // values, now actually enforced: closing the gap needs tests for the
      // scaffolding this skeleton ships, not a higher number here.
      thresholds: {
        lines: 72,
        functions: 69,
        statements: 72,
        branches: 77,
      },
    },
  },
});
