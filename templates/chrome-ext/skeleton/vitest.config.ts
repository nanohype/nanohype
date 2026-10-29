import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the provider registry and the gateway provider, whose suite runs
      // it against an in-process HTTP server. Everything else needs a browser
      // runtime (background/content/UI, chrome-API-backed messaging/storage).
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/background/**",
        "src/content/**",
        "src/options/**",
        "src/sidepanel/**",
        "src/lib/ai.ts",
        "src/lib/logger.ts",
        "src/lib/messaging.ts",
        "src/lib/storage.ts",
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
