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
      // Gate the module's pure logic: the provider registry, filter
      // compiler, similarity math, retry/batch helpers, and the circuit
      // breaker. SDK-backed providers (pgvector/qdrant/pinecone) talk to
      // live databases and are exercised by integration tests, not unit
      // coverage. The mock provider, barrels, bootstrap, and type-only
      // modules carry no logic to gate.
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
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
      },
    },
  },
});
