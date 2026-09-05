import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the protocol server, transport/skill registries, the example
      // skill, the circuit breaker, the router's reply parsing, and the eval
      // corpus loader. Live transports (http/websocket), the protocol client,
      // discovery, SDK providers, the eval runner, and wiring (agent,
      // bootstrap, logger, barrels, type-only modules) are
      // integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/agent.ts",
        "src/bootstrap.ts",
        "src/logger.ts",
        "src/eval/runner.ts",
        "src/discovery/**",
        "src/protocol/client.ts",
        "src/protocol/transport/http.ts",
        "src/protocol/transport/websocket.ts",
        "src/providers/**",
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
