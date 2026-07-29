import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
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
      // Below the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). These are the measured
      // values, now actually enforced: closing the gap needs tests for the
      // scaffolding this skeleton ships, not a higher number here.
      thresholds: {
        lines: 85,
        functions: 61,
        statements: 85,
        branches: 76,
      },
    },
  },
});
