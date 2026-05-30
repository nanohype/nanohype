import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the pure logic (chunking, retrieval). SDK-backed providers, the
      // generation/ingest IO paths, bootstrap, and CLI entry are exercised by
      // the integration test / live SDKs, not unit-covered.
      exclude: [
        "src/**/*.test.ts",
        "src/__tests__/**",
        "src/index.ts",
        "src/bootstrap.ts",
        "src/ingest.ts",
        "src/generation.ts",
        "src/logger.ts",
        "src/config.ts",
        "src/providers/**",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
      },
    },
  },
});
