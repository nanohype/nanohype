import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the pipeline, processors, mock provider, registries, and circuit
      // breaker. SDK-backed providers (anthropic/openai/whisper), the output
      // formatter, and wiring are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/config.ts",
        "src/logger.ts",
        "src/output/formatter.ts",
        "src/providers/anthropic.ts",
        "src/providers/openai.ts",
        "src/providers/whisper.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Below the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). These are the measured
      // values, now actually enforced: closing the gap needs tests for the
      // scaffolding this skeleton ships, not a higher number here.
      thresholds: {
        lines: 52,
        functions: 70,
        statements: 52,
        branches: 81,
      },
    },
  },
});
