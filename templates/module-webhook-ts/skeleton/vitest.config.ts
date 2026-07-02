import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the sender and the signature schemes. The receiver, event log, and
      // wiring are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/webhook/bootstrap.ts",
        "src/webhook/event-log.ts",
        "src/webhook/receiver.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 61,
        statements: 85,
        branches: 76,
      },
    },
  },
});
