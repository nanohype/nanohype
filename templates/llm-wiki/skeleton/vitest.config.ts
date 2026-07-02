import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate operations, schema parsing, wiki search/link-graph/page logic,
      // the registries, and the circuit breaker. The HTTP API, CLI, IO-backed
      // sources/storage (local/git), SDK providers, mocks, and the index
      // manager are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/config.ts",
        "src/api/**",
        "src/cli/**",
        "src/llm/anthropic.ts",
        "src/llm/mock.ts",
        "src/sources/local.ts",
        "src/sources/mock.ts",
        "src/storage/git.ts",
        "src/storage/mock.ts",
        "src/tenant/auth.ts",
        "src/wiki/index-manager.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 73,
      },
    },
  },
});
