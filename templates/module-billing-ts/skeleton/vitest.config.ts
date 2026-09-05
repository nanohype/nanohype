import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate invoicing, metering, the webhook handler, registry, the circuit
      // breaker, and the Stripe provider. Out: bootstrap and config, which
      // guard startup; logger and metrics, the log and OTel sinks; the mock
      // provider, an in-memory stand-in.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/billing/bootstrap.ts",
        "src/billing/config.ts",
        "src/billing/logger.ts",
        "src/billing/metrics.ts",
        "src/billing/providers/mock.ts",
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
        // The Stripe provider hands the account's secret key to the SDK
        // client and decides, per request, whether an inbound webhook really
        // came from Stripe. The standard's 'security-critical-100' rule holds
        // an authentication path to every branch: an unexercised branch here
        // is a signature check nothing proves runs.
        "src/billing/providers/stripe.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
      },
    },
  },
});
