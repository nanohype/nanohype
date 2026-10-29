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
      // Gate the assertion library, case helpers, suite builder, and the
      // bedrock and gateway providers. Out of the denominator: the runner and
      // the reporters, which drive a live provider and write to stdout and
      // disk; the timer-driven resilience layer; the anthropic and openai
      // providers, which instantiate a vendor SDK and need a key; and the
      // provider registry and the mock provider, which the suites reach only
      // through the runner.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/runner.ts",
        "src/providers/anthropic.ts",
        "src/providers/openai.ts",
        "src/providers/mock.ts",
        "src/providers/registry.ts",
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
