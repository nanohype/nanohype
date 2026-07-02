import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate invoicing, metering, the webhook handler, registry, and circuit
      // breaker. The Stripe provider, the mock, and wiring are
      // integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/billing/bootstrap.ts",
        "src/billing/config.ts",
        "src/billing/logger.ts",
        "src/billing/metrics.ts",
        "src/billing/providers/stripe.ts",
        "src/billing/providers/mock.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 76,
      },
    },
  },
});
