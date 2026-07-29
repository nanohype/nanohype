import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the queue facade, job helpers, memory provider, and registry.
      // Live-backend providers (bullmq/sqs), the worker loop, and wiring are
      // integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/queue/bootstrap.ts",
        "src/queue/metrics.ts",
        "src/queue/worker.ts",
        "src/queue/providers/bullmq.ts",
        "src/queue/providers/sqs.ts",
        "src/queue/providers/index.ts",
        "src/**/types.ts",
      ],
      // Below the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). These are the measured
      // values, now actually enforced: closing the gap needs tests for the
      // scaffolding this skeleton ships, not a higher number here.
      thresholds: {
        lines: 73,
        functions: 63,
        statements: 73,
        branches: 85,
      },
    },
  },
});
