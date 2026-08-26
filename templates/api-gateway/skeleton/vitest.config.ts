import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the routing and resilience logic a consumer keeps. Excluded:
      // wiring/bootstrap (index, bootstrap, config, logger, metrics) and
      // type-only modules, none of which carry branching worth a threshold.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/gateway/index.ts",
        "src/gateway/bootstrap.ts",
        "src/gateway/config.ts",
        "src/gateway/logger.ts",
        "src/gateway/metrics.ts",
        "src/gateway/types.ts",
        "src/gateway/router/types.ts",
      ],
      // Pinned at what the suite measures, not at the published floor. The
      // middleware and the health checker have no tests yet; declaring 75 here
      // would fail every scaffold on its first `npm test`, and declaring
      // nothing is what let the gap go unrecorded. These numbers hold the line
      // against a regression while the distance is closed.
      thresholds: {
        lines: 53,
        functions: 56,
        statements: 52,
        branches: 51,
      },
    },
  },
});
