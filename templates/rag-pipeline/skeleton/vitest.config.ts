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
        // the ingest IO path, the providers barrel, the SDK-backed providers
        // other than anthropic and bedrock, and the mock LLM and vector store.
        // Nothing covers these: the eval runner asks a live model, no suite
        // here reaches a live OpenAI, Cohere, Chroma, pgvector, Pinecone or
        // Qdrant endpoint, and no suite calls the mocks. Untested shipped code,
        // said plainly, rather than a suite named as the reason it need not be
        // measured. The anthropic and bedrock providers are measured: their
        // request suites replace the SDK client with a recorder.
        "src/index.ts",
        "src/eval/runner.ts",
        "src/bootstrap.ts",
        "src/ingest.ts",
        "src/config.ts",
        "src/providers/chroma.ts",
        "src/providers/cohere.ts",
        "src/providers/index.ts",
        "src/providers/mock-vectorstore.ts",
        "src/providers/mock.ts",
        "src/providers/openai.ts",
        "src/providers/pgvector.ts",
        "src/providers/pinecone.ts",
        "src/providers/qdrant.ts",
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
