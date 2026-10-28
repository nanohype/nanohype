import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the module's pure logic: the registry, factory facade, core
      // types (pricing/cost), token counting, circuit breaker, request
      // timeout and stream guard, adapters, and the deterministic mock
      // provider, along with every provider that calls a model, each with
      // a request suite that runs its SDK client, or ollama's own `fetch`
      // call, over an in-process transport. Bootstrap, the index barrels,
      // logger, metrics (OTel no-ops), and config are not unit-covered.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/llm-providers/index.ts",
        "src/llm-providers/bootstrap.ts",
        "src/llm-providers/logger.ts",
        "src/llm-providers/metrics.ts",
        "src/llm-providers/config.ts",
        "src/llm-providers/providers/index.ts",
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
  },
});
