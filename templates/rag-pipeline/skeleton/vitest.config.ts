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
      // Gate the pure logic (chunking, retrieval, the eval corpus loader and
      // its assertion checks).
      exclude: [
        "src/**/*.test.ts",
        "src/__tests__/**",
        // Driven end to end by the integration suite, which answers a question
        // from a retrieved context and logs while it does.
        "src/generation.ts",
        "src/logger.ts",
        // The CLI entry, the eval runner, the wiring that reads the environment,
        // the ingest IO path, and the SDK-backed providers. Nothing covers these: the
        // provider suites import each module for the registration it performs
        // at load and call nothing in it, the eval runner asks a live model, and
        // no suite here reaches a live
        // Anthropic, OpenAI, Bedrock, Cohere, Chroma, pgvector, Pinecone or
        // Qdrant endpoint. Untested shipped code, said plainly, rather than a
        // suite named as the reason it need not be measured.
        "src/index.ts",
        "src/eval/runner.ts",
        "src/bootstrap.ts",
        "src/ingest.ts",
        "src/config.ts",
        "src/providers/**",
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
