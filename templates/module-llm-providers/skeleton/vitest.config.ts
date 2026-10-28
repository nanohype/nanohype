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
      // types (pricing/cost), token counting, circuit breaker, adapters, and
      // the deterministic mock provider, along with the anthropic and bedrock
      // providers, whose request suites run the real SDK clients over an
      // in-process transport. The other SDK-backed providers (openai, groq,
      // vertex, huggingface, ollama) have no suite, and bootstrap, the index
      // barrels, logger, metrics (OTel no-ops), and config are not
      // unit-covered.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/llm-providers/index.ts",
        "src/llm-providers/bootstrap.ts",
        "src/llm-providers/logger.ts",
        "src/llm-providers/metrics.ts",
        "src/llm-providers/config.ts",
        "src/llm-providers/providers/index.ts",
        "src/llm-providers/providers/openai.ts",
        "src/llm-providers/providers/groq.ts",
        "src/llm-providers/providers/vertex.ts",
        "src/llm-providers/providers/huggingface.ts",
        "src/llm-providers/providers/ollama.ts",
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
