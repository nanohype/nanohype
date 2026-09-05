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
      // corpus loader. Out of the denominator: agent.ts and bootstrap.ts exit
      // the process; the client, the http/websocket transports and the agent
      // directory need a reachable remote agent; the eval runner asks a live
      // model; the logger, the agent-card builder, the barrels and the
      // type-only modules are wiring; and all of src/providers — anthropic.ts
      // and openai.ts construct their vendor client at module scope, so
      // importing either needs a key. The directory glob also takes
      // registry.ts, a name-to-factory Map that needs none.
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
