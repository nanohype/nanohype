import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
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
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 52,
        functions: 70,
        statements: 52,
        branches: 81,
      },
    },
  },
});
