import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // The denominator is the dataset split/validate logic. Out: bootstrap,
      // config and logger, which read the environment at process start; prepare,
      // eval and training, built around disk IO and a fine-tuning API; the
      // timer-driven circuit breaker; barrels and type declarations.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/config.ts",
        "src/logger.ts",
        "src/dataset/prepare.ts",
        "src/eval/**",
        "src/training/**",
        "src/resilience/**",
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
