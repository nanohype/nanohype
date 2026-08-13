import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the token-bucket algorithm, memory store, and the registries. The
      // fixed/sliding-window algorithms, redis store, middleware, and wiring
      // are integration-exercised — ratchet them in as unit suites land.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/rate-limit/bootstrap.ts",
        "src/rate-limit/middleware.ts",
        "src/rate-limit/algorithms/fixed-window.ts",
        "src/rate-limit/algorithms/sliding-window.ts",
        "src/rate-limit/stores/redis.ts",
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
