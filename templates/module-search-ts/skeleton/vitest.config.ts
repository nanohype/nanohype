import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the hybrid combiner, mock provider, registry, and circuit breaker.
      // SDK-backed providers (algolia/meilisearch/typesense) and wiring are
      // integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/search/bootstrap.ts",
        "src/search/config.ts",
        "src/search/logger.ts",
        "src/search/metrics.ts",
        "src/search/providers/algolia.ts",
        "src/search/providers/meilisearch.ts",
        "src/search/providers/typesense.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // The floor published in nanohype/standards/testing-rubric.json. A
      // scaffolded project starts held to the same bar it will be graded
      // against; raise these as the suite grows, never lower them.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
  },
});
