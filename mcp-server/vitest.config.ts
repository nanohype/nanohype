import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      // Explicit include so modules with zero tests still count against the
      // floor — the gate measures the whole src/ surface, not just what the
      // suite happened to load.
      include: ["src/**/*.ts"],
      // Honest floors set just below the measured actuals so the gate catches a
      // regression — a new untested module dragging the denominator down —
      // without flaking on minor fluctuation. All four sit above the org floor
      // (branches 60 / functions 75 / lines 75 / statements 75, from
      // standards/testing-rubric.json). Run via `npm run test:coverage`.
      //
      // What is left uncovered in index.ts is main() and the invoked-as-bin
      // guard: process wiring that only runs when the binary is executed. The
      // logic that used to hide behind it — source resolution from the
      // environment, and handler registration — is tested.
      thresholds: {
        lines: 89, // measured 90.98
        functions: 80, // measured 83.33
        branches: 90, // measured 92.85
        statements: 89, // measured 91.72
      },
    },
  },
});
