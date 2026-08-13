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
      // Above the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). Branches sits over the
      // published number because the gated surface is assertion evaluation and
      // suite orchestration, which is mostly branching — dropping it to 60 would
      // let a real regression through.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
  },
});
