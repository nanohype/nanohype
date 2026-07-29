import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
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
      // The floor published in nanohype/standards/testing-rubric.json. A
      // scaffolded project starts held to the same bar it will be graded
      // against; raise these as the suite grows, never lower them.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 73,
      },
    },
  },
});
