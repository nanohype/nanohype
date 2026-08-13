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
      // breaker. The agent loop, memory, eval, and token helpers plus SDK
      // providers and wiring are exercised end-to-end, not unit-covered —
      // ratchet them in as unit suites land.
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
