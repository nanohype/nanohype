import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
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
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 83,
      },
    },
  },
});
