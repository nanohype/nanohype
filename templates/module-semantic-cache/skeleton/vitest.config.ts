import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the module's pure logic: the cache facade, similarity math,
      // registries, the memory store, and the gateway adapter. SDK-backed
      // embedders (Bedrock/OpenAI), the bootstrap guard, barrels, and the
      // OTel metrics surface are exercised by live SDKs / runtime, not unit
      // covered.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/semantic-cache/embedder/bedrock.ts",
        "src/semantic-cache/embedder/openai.ts",
        "src/semantic-cache/embedder/index.ts",
        "src/semantic-cache/store/index.ts",
        "src/semantic-cache/bootstrap.ts",
        "src/semantic-cache/metrics.ts",
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
