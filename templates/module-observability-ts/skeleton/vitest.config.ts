import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the logger and exporter registry. Excluded: bootstrap.ts exits
      // the process on an unresolved placeholder, tracer.ts and metrics.ts
      // delegate to the OpenTelemetry global API, and the exporters construct
      // SDK exporter objects — the behaviour under them is the SDK's.
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
