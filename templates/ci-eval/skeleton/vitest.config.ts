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
      // Gate the baseline store, reporter, runner, assertions, and provider
      // registry. Out of the denominator: bootstrap.ts exits the process; the
      // anthropic/openai providers need an API key; and the Zod config schema,
      // the stderr logger, the barrels and the type-only modules are wiring.
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
      // At or above the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). Branches sits well over the
      // published number because the gated surface is assertion dispatch and
      // scoring, which is mostly branching — lowering it to 60 here would let a
      // real regression through.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
  },
});
