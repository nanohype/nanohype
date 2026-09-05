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
      // Gate the pure logic (chunking, retrieval, the eval corpus loader and
      // its assertion checks). SDK-backed providers, the generation/ingest IO
      // paths, bootstrap, and the CLI and eval entry points are exercised by
      // the integration test / live SDKs, not unit-covered.
      exclude: [
        "src/**/*.test.ts",
        "src/__tests__/**",
        "src/index.ts",
        "src/eval/runner.ts",
        "src/bootstrap.ts",
        "src/ingest.ts",
        "src/generation.ts",
        "src/logger.ts",
        "src/config.ts",
        "src/providers/**",
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
    },
  },
});
