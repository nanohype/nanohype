import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the pipeline, processors, mock provider, registries, the eval
      // corpus loader, and circuit breaker. The anthropic/openai/whisper
      // providers need an API key and a hosted endpoint; bootstrap exits on an
      // unresolved placeholder; config and logger read the environment; the
      // formatter runs under processFile; and the eval runner calls a live
      // provider, so it is a command a consumer runs rather than a CI step —
      // the loader it depends on for its empty-corpus refusal is covered here
      // instead.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/eval/runner.ts",
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
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
  },
});
