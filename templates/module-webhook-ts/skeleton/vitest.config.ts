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
      // Above the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). Branches sits over the
      // published number because the gated surface is signature verification,
      // where each rejection path is a branch that must stay covered.
      thresholds: {
        lines: 97,
        functions: 100,
        statements: 97,
        branches: 82,
      },
    },
  },
});
