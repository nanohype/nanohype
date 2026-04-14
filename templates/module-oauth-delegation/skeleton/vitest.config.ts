import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
      },
      include: ["src/**/*.ts"],
      exclude: [
        "dist/**",
        "**/__tests__/**",
        "**/*.config.ts",
        "src/oauth/index.ts",
      ],
    },
  },
});
