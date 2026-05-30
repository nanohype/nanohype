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
      // Gate the pure transform algorithms + registries (focused unit tests).
      // SDK-backed embedders, IO ingest/output adapters, the orchestrator glue,
      // bootstrap, and the semantic chunker are exercised by integration / live
      // SDKs, not unit-covered.
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
        "src/pipeline/transform/semantic.ts",
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
