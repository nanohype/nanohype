import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the pure logic (provider registry, circuit breaker). The SDK
      // adapters (providers/bedrock|anthropic|openai|mock), Bolt handlers
      // (events, commands), metrics, logger, and bootstrap are exercised by
      // live SDKs / integration, not unit-covered.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/index.ts",
        "src/bootstrap.ts",
        "src/logger.ts",
        "src/metrics.ts",
        "src/config.ts",
        "src/providers/bedrock.ts",
        "src/providers/anthropic.ts",
        "src/providers/openai.ts",
        "src/providers/mock.ts",
        "src/events/**",
        "src/commands/**",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
      },
    },
  },
});
