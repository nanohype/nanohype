import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Sources only, so nothing compiled under `dist/` is ever collected as a
    // second copy of the suite.
    include: ["src/**/*.test.ts"],
    // The logger writes every info and warn line to stdout, where it buries a
    // failing test's output. `LOG_LEVEL=debug npm test` brings them back.
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? "error" },
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate everything that carries behavior: the billing service facade,
      // config validation, invoicing, metering, entitlement, the webhook
      // router, the registry, the circuit breaker, and both providers. Out:
      // bootstrap, which exits the process; logger and metrics, the log and
      // OTel sinks; the providers barrel, which only imports and re-exports;
      // and the type-only modules.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/billing/bootstrap.ts",
        "src/billing/logger.ts",
        "src/billing/metrics.ts",
        "src/billing/providers/index.ts",
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
        // The webhook router is the gate between a request and a handler: it
        // decides that an event which failed verification reaches none. Held
        // to every branch for the same reason as the provider that verifies.
        "src/billing/webhooks/handler.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        // isEntitled is the one decision on whether a subscription grants
        // access to a plan; a branch nothing exercises is a status nothing
        // proves is refused.
        "src/billing/subscriptions.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        // The mock accepts any webhook signature and reports charges paid, so
        // its refusal to start unless named is all that keeps it out of a
        // deployment.
        "src/billing/providers/mock.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        // Config validation is what refuses a malformed key, timeout, retry
        // count or HTTP client before any provider receives it.
        "src/billing/config.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
      },
    },
  },
});
