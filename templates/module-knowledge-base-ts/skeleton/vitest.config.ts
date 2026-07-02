import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the ingest adapter, mock provider, registry, and circuit breaker.
      // SDK-backed providers (notion/confluence/coda/google-docs) and wiring
      // are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/knowledge-base/bootstrap.ts",
        "src/knowledge-base/config.ts",
        "src/knowledge-base/logger.ts",
        "src/knowledge-base/metrics.ts",
        "src/knowledge-base/providers/coda.ts",
        "src/knowledge-base/providers/confluence.ts",
        "src/knowledge-base/providers/google-docs.ts",
        "src/knowledge-base/providers/notion.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 76,
      },
    },
  },
});
