import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the memory provider and registry. Redis/memcached providers talk
      // to live stores; wiring and type-only modules carry no logic to gate.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/cache/bootstrap.ts",
        "src/cache/metrics.ts",
        "src/cache/providers/memcached.ts",
        "src/cache/providers/redis.ts",
        "src/types/**",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 85,
      },
    },
  },
});
