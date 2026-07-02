import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the provider registry — the only pure in-process logic. Everything
      // else needs a browser runtime (background/content/UI, chrome-API-backed
      // messaging/storage) or a live SDK.
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
        "src/lib/providers/anthropic.ts",
        "src/lib/providers/openai.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 85,
      },
    },
  },
});
