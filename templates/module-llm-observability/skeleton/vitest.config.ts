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
      // Gate the pure logic (cost calculator/pricing/anomaly, quality
      // statistics, tracer, exporter registry). The observer facade,
      // bootstrap, barrels, OTel-backed metrics/logger, and the IO-bound
      // exporters (OTLP/console/json-file) are exercised by the SDK at
      // runtime, not unit-covered.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/**/index.ts",
        "src/**/types.ts",
        "src/llm-observability/bootstrap.ts",
        "src/llm-observability/logger.ts",
        "src/llm-observability/metrics.ts",
        "src/llm-observability/exporters/console.ts",
        "src/llm-observability/exporters/json-file.ts",
        "src/llm-observability/exporters/otlp.ts",
        "src/llm-observability/exporters/mock.ts",
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
