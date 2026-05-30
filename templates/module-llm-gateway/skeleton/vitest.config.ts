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
      // Gate the pure logic: routing strategies, caching strategies, the cost
      // tracker/anomaly/pricing, the registries, and the token counter. The
      // SDK-backed provider adapters (bedrock/anthropic/openai/groq, plus the
      // mock), the index barrels, bootstrap, and the OTel metrics shim are
      // exercised by the gateway integration test / live SDKs, not unit-covered.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/gateway/index.ts",
        "src/gateway/bootstrap.ts",
        "src/gateway/metrics.ts",
        "src/gateway/providers/index.ts",
        "src/gateway/providers/bedrock.ts",
        "src/gateway/providers/anthropic.ts",
        "src/gateway/providers/openai.ts",
        "src/gateway/providers/groq.ts",
        "src/gateway/providers/mock.ts",
        "src/gateway/routing/index.ts",
        "src/gateway/caching/index.ts",
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
