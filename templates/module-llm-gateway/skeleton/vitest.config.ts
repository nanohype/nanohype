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
      // Gate the pure logic: routing strategies, caching strategies, the cost
      // tracker/anomaly/pricing, the registries, and the token counter.
      // Excluded: the vendor adapters (bedrock/anthropic/openai/groq) each
      // build an SDK client from ambient credentials, the mock provider is
      // fixture data, metrics declares OTel instruments, bootstrap exits the
      // process, and the barrels and facade wire the registries gated above.
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
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
  },
});
