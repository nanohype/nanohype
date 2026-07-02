import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
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
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 80,
      },
    },
  },
});
