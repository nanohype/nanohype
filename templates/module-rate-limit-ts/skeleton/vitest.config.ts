import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
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
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 83,
      },
    },
  },
});
