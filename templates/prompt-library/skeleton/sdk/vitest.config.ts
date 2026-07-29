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
      // A ratchet set a point under measured, and above the floor published in
      // nanohype/standards/testing-rubric.json (lines/functions/statements 75,
      // branches 60). Raise it as coverage grows; never lower it — a formatting
      // pass that shifts statement counts should not be able to buy headroom.
      thresholds: {
        lines: 99,
        functions: 99,
        statements: 99,
        branches: 92,
      },
    },
  },
});
