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
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 81,
      },
    },
  },
});
