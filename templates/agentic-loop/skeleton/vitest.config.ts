import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
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
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 85,
      },
    },
  },
});
