import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the event buffer, middleware, mock provider, registry, and circuit
      // breaker. SDK-backed providers (amplitude/mixpanel/posthog/segment) and
      // wiring are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/analytics/bootstrap.ts",
        "src/analytics/config.ts",
        "src/analytics/logger.ts",
        "src/analytics/metrics.ts",
        "src/analytics/providers/amplitude.ts",
        "src/analytics/providers/mixpanel.ts",
        "src/analytics/providers/posthog.ts",
        "src/analytics/providers/segment.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // The floor published in nanohype/standards/testing-rubric.json. A
      // scaffolded project starts held to the same bar it will be graded
      // against; raise these as the suite grows, never lower them.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 80,
      },
    },
  },
});
