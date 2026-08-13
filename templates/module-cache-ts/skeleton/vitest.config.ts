import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
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
