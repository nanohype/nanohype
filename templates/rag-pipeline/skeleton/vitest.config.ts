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
      // Gate the pure logic (chunking, retrieval, request timeouts, the eval
      // corpus loader and its assertion checks), the gateway providers, whose
      // request suite runs their `fetch` calls against an in-process HTTP
      // server, and the bedrock providers, whose request suite runs the real
      // SDK client over an in-process transport.
      exclude: [
        "src/**/*.test.ts",
        "src/__tests__/**",
        // Driven end to end by the integration suite, which answers a question
        // from a retrieved context and logs while it does.
        "src/generation.ts",
        "src/logger.ts",
        // The CLI entry, the eval runner, the wiring that reads the environment,
        // the ingest IO path, the providers barrel, the providers other than
        // gateway and bedrock, and the mock LLM and vector store. No suite
        // measures these: the eval runner asks a live model, no suite reaches
        // a pgvector, Pinecone or Qdrant endpoint, the
        // Chroma suite runs only when CHROMA_TEST_URL names a live server, and
        // no suite calls the mocks.
        "src/index.ts",
        "src/eval/runner.ts",
        "src/bootstrap.ts",
        "src/ingest.ts",
        "src/config.ts",
        "src/providers/chroma.ts",
        "src/providers/index.ts",
        "src/providers/mock-vectorstore.ts",
        "src/providers/mock.ts",
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
