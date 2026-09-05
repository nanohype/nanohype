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
      // Gate the chunk strategies, the eval corpus loader and the checks its
      // cases are written against, the registries, the orchestrator and the
      // circuit breaker. Out of the denominator: index.ts calls main() at
      // import, so loading it starts the CLI and exits the process;
      // bootstrap.ts returns ahead of its checks under VITEST; logger.ts
      // writes JSON lines to the console, and metrics.ts builds OTel
      // instruments that no-op unless a consumer initializes an SDK; the eval
      // runner reaches a provider. Each excluded ingest, embed and output
      // module is the one performing that stage's I/O — filesystem, fetch, DNS
      // resolution, stdout or a vendor SDK; the registries beside them stay in.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/pipeline/index.ts",
        "src/pipeline/bootstrap.ts",
        "src/pipeline/logger.ts",
        "src/pipeline/metrics.ts",
        "src/pipeline/ingest/file.ts",
        "src/pipeline/ingest/web.ts",
        "src/pipeline/ingest/url-guard.ts",
        "src/pipeline/embed/bedrock.ts",
        "src/pipeline/embed/openai.ts",
        "src/pipeline/output/console.ts",
        "src/pipeline/output/json-file.ts",
        "src/pipeline/eval/runner.ts",
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
