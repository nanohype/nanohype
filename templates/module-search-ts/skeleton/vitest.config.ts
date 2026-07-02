import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
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
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 79,
      },
    },
  },
});
