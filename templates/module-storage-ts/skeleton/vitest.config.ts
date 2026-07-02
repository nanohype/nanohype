import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the local provider, registry, and circuit breaker. SDK-backed
      // providers (s3/gcs/r2 and their shared helpers), the client facade, and
      // wiring are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/storage/bootstrap.ts",
        "src/storage/client.ts",
        "src/storage/providers/gcs.ts",
        "src/storage/providers/helpers.ts",
        "src/storage/providers/r2.ts",
        "src/storage/providers/s3.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 75,
      },
    },
  },
});
