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
      // Gate the provider registry, the circuit breaker, and the gateway and
      // bedrock providers, whose suites run them against in-process HTTP
      // servers. The exclusions: index.ts starts Bolt at import and
      // bootstrap.ts returns early under VITEST; config, logger and metrics
      // are process.env, console and OTel sinks; mock.ts answers from a
      // canned keyword table; events/ and commands/ hand callbacks to Bolt's
      // dispatcher.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/index.ts",
        "src/bootstrap.ts",
        "src/logger.ts",
        "src/metrics.ts",
        "src/config.ts",
        "src/providers/mock.ts",
        "src/events/**",
        "src/commands/**",
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
