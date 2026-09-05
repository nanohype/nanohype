import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the server assembly and the example tool/resource handlers.
      // Transports (stdio/streamable-http) and wiring are exercised by MCP
      // clients, not unit coverage.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/logger.ts",
        "src/transports/**",
        "src/**/index.ts",
        // The `example.*` tool and resource are demo handlers a consumer
        // deletes on first use — the same exclusion ts-service makes, for the
        // same reason. Gating them would hold the scaffold to coverage of code
        // that is not meant to survive scaffolding.
        "src/tools/example.ts",
        "src/resources/example.ts",
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
