import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the orchestrator core, agents, context, routing, the mock
      // provider, and the circuit breaker. SDK-backed providers
      // (anthropic/openai) and wiring (bootstrap, config, logger, metrics,
      // barrels, type-only modules) are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/orchestrator/bootstrap.ts",
        "src/orchestrator/config.ts",
        "src/orchestrator/logger.ts",
        "src/orchestrator/metrics.ts",
        "src/orchestrator/providers/anthropic.ts",
        "src/orchestrator/providers/openai.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 73,
        functions: 85,
        statements: 73,
        branches: 79,
      },
    },
  },
});
