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
      // Gate the module's pure logic: the registry, factory facade, core
      // types (pricing/cost), token counting, circuit breaker, adapters, and
      // the deterministic mock provider. SDK-backed providers (bedrock,
      // openai, anthropic, groq, vertex, azure-openai, huggingface, ollama)
      // are exercised against live SDKs, not unit-covered, as are bootstrap,
      // the index barrels, logger, metrics (OTel no-ops), and config.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/llm-providers/index.ts",
        "src/llm-providers/bootstrap.ts",
        "src/llm-providers/logger.ts",
        "src/llm-providers/metrics.ts",
        "src/llm-providers/config.ts",
        "src/llm-providers/providers/index.ts",
        "src/llm-providers/providers/bedrock.ts",
        "src/llm-providers/providers/openai.ts",
        "src/llm-providers/providers/anthropic.ts",
        "src/llm-providers/providers/groq.ts",
        "src/llm-providers/providers/vertex.ts",
        "src/llm-providers/providers/azure-openai.ts",
        "src/llm-providers/providers/huggingface.ts",
        "src/llm-providers/providers/ollama.ts",
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
