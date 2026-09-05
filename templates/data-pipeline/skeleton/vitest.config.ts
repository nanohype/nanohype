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
      // Gate the pure transform algorithms, the eval corpus loader and the
      // checks its cases are written against, and the registries (focused unit
      // tests). SDK-backed embedders, IO ingest/output adapters, the
      // orchestrator glue, bootstrap and the eval runner reach a provider or a
      // filesystem, so they are exercised live rather than unit-covered.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/pipeline/index.ts",
        "src/pipeline/bootstrap.ts",
        "src/pipeline/logger.ts",
        "src/pipeline/metrics.ts",
        "src/pipeline/orchestrator.ts",
        "src/pipeline/ingest/**",
        "src/pipeline/embed/**",
        "src/pipeline/output/**",
        "src/pipeline/eval/runner.ts",
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
