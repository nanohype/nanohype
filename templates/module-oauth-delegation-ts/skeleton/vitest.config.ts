import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
      },
      include: ["src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.config.ts", "src/oauth/index.ts"],
    },
  },
});
