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
      // Gate the consumer handler, scheduler cron logic, and circuit breaker.
      // Example jobs, the health server, and wiring are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/worker/bootstrap.ts",
        "src/worker/config.ts",
        "src/worker/logger.ts",
        "src/worker/metrics.ts",
        "src/worker/index.ts",
        "src/worker/consumer/jobs/**",
        "src/worker/scheduler/jobs/**",
        "src/worker/health/**",
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
