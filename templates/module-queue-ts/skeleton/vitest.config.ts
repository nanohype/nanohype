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
      // Above the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). Branches sits over the
      // published number because the gated surface is option resolution and
      // worker dispatch, which is mostly branching.
      thresholds: {
        lines: 94,
        functions: 85,
        statements: 94,
        branches: 90,
      },
    },
  },
});
