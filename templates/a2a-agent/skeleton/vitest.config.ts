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
      // skill, the circuit breaker, the router's reply parsing, the eval
      // corpus loader and the gateway provider, whose suite runs it against
      // an in-process HTTP server. Out of the denominator: agent.ts and
      // bootstrap.ts exit the process; the client, the http/websocket
      // transports and the agent directory need a reachable remote agent;
      // the eval runner asks a live model; and the logger, the agent-card
      // builder, the barrels and the type-only modules are wiring.
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
