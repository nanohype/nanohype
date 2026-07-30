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
      // Above the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). The remaining gap is the
      // video path: `analyzeFrames` needs a real video and an ffmpeg binary, so
      // it is exercised against the mock provider directly rather than through
      // `processFile`. It is not excluded — it counts against these numbers.
      thresholds: {
        lines: 79,
        functions: 90,
        statements: 79,
        branches: 81,
      },
    },
  },
});
