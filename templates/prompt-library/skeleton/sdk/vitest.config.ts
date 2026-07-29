import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/**/types.ts"],
      // Below the floor published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). These are the measured
      // values, now actually enforced: closing the gap needs tests for the
      // directory walk and the render helpers, not a higher number here.
      thresholds: {
        lines: 71,
        functions: 71,
        statements: 71,
        branches: 80,
      },
    },
  },
});
