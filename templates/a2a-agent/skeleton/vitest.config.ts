import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the protocol server, transport/skill registries, the example
      // skill, and the circuit breaker. Live transports (http/websocket), the
      // protocol client, discovery, SDK providers, and wiring (agent, bootstrap,
      // logger, barrels, type-only modules) are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/agent.ts",
        "src/bootstrap.ts",
        "src/logger.ts",
        "src/discovery/**",
        "src/protocol/client.ts",
        "src/protocol/transport/http.ts",
        "src/protocol/transport/websocket.ts",
        "src/providers/**",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 78,
      },
    },
  },
});
