import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the evaluator, tracker, store registry, and circuit breaker.
      // Excluded: barrels, type and schema declarations, the startup check that
      // exits the process, logger and OTel shims, and the store bodies — redis
      // needs a live server, json-file the disk, and the memory and mock stores
      // are Map wrappers with no branching.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/feature-flags/bootstrap.ts",
        "src/feature-flags/config.ts",
        "src/feature-flags/logger.ts",
        "src/feature-flags/metrics.ts",
        "src/feature-flags/stores/json-file.ts",
        "src/feature-flags/stores/memory.ts",
        "src/feature-flags/stores/mock.ts",
        "src/feature-flags/stores/redis.ts",
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
