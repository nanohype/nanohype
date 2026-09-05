import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the tool/provider registries, the example tool, and the circuit
      // breaker. Out of the denominator: agent.ts and bootstrap.ts, which run
      // the loop and read package metadata from the environment at import,
      // then exit the process; eval/runner.ts, which drives a live provider;
      // the logger, which reads LOG_LEVEL at import and writes to stdout;
      // metrics.ts, whose body is OTel instrument declarations with no logic
      // of its own; tokens.ts, which loads a multi-megabyte BPE rank table;
      // and the anthropic and openai providers, which need a vendor key.
      // Swept in by those patterns without needing to be: eval/assertions.ts,
      // src/memory/** and providers/mock.ts, all offline pure code.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/agent.ts",
        "src/bootstrap.ts",
        "src/logger.ts",
        "src/metrics.ts",
        "src/tokens.ts",
        "src/eval/**",
        "src/memory/**",
        "src/providers/anthropic.ts",
        "src/providers/openai.ts",
        "src/providers/mock.ts",
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
