import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the logger and exporter registry. The OTel-backed tracer/metrics
      // and exporters (console/datadog/otlp) are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/telemetry/bootstrap.ts",
        "src/telemetry/metrics.ts",
        "src/telemetry/tracer.ts",
        "src/telemetry/exporters/console.ts",
        "src/telemetry/exporters/datadog.ts",
        "src/telemetry/exporters/otlp.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 85,
      },
    },
  },
});
