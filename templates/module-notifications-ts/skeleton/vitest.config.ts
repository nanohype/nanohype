import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the template renderer, channel registry, and circuit breaker.
      // Excluded: bootstrap.ts exits the process on an unresolved
      // placeholder, and the channel directories hold self-registering
      // barrels, a development mock, and vendor adapters that reach a
      // provider API under a credential.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/notifications/bootstrap.ts",
        "src/notifications/channels/email/**",
        "src/notifications/channels/push/**",
        "src/notifications/channels/sms/**",
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
