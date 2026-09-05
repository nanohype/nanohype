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
      // Gate the module's pure logic: the provider registry, filter
      // compiler, similarity math, retry/batch helpers, and the circuit
      // breaker. The pgvector/qdrant/pinecone providers need a live
      // database and its credentials; bootstrap exits on an unresolved
      // placeholder; index.ts and providers/index.ts delegate and
      // re-export; the type modules hold interfaces and one-line guards;
      // the mock provider is a fixture for a consumer's own tests.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/vector-store/index.ts",
        "src/vector-store/bootstrap.ts",
        "src/vector-store/providers/index.ts",
        "src/vector-store/providers/types.ts",
        "src/vector-store/providers/pgvector.ts",
        "src/vector-store/providers/qdrant.ts",
        "src/vector-store/providers/pinecone.ts",
        "src/vector-store/providers/mock.ts",
        "src/vector-store/types.ts",
        "src/vector-store/filters/types.ts",
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
