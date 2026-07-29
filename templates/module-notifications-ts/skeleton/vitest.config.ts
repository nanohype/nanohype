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
      // SDK-backed channels (email/push/sms) and wiring are
      // integration-exercised.
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
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 83,
      },
    },
  },
});
