import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the orchestrator core, agents, context, routing, the mock
      // provider, the circuit breaker, and the eval corpus loader and its plan
      // checks. Out of the denominator: bootstrap.ts exits the process; the
      // anthropic/openai providers need vendor credentials; the eval runner is
      // a live command against a provider; metrics.ts declares OTel instruments
      // that no-op without an SDK; and the Zod config schema, the logger, the
      // barrels and the type-only modules are wiring.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/orchestrator/bootstrap.ts",
        "src/orchestrator/config.ts",
        "src/orchestrator/logger.ts",
        "src/orchestrator/metrics.ts",
        "src/orchestrator/eval/runner.ts",
        "src/orchestrator/providers/anthropic.ts",
        "src/orchestrator/providers/openai.ts",
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
