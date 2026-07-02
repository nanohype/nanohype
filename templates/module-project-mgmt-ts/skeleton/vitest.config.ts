import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the mock provider, registry, and circuit breaker. SDK-backed
      // providers (jira/linear/asana/shortcut) and wiring are
      // integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/project-mgmt/bootstrap.ts",
        "src/project-mgmt/config.ts",
        "src/project-mgmt/logger.ts",
        "src/project-mgmt/metrics.ts",
        "src/project-mgmt/providers/asana.ts",
        "src/project-mgmt/providers/jira.ts",
        "src/project-mgmt/providers/linear.ts",
        "src/project-mgmt/providers/shortcut.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 84,
      },
    },
  },
});
