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
      // Honest floors set just below the measured actuals (see the numbers in
      // the comment on each threshold) so the gate catches a regression — a
      // new untested module dragging the denominator down — without flaking
      // on minor fluctuation. index.ts (bin wiring + source resolution) is
      // currently untested and drags functions down; raise these when it
      // grows tests. Run via `npm run test:coverage`.
      thresholds: {
        lines: 76, // measured 77.86
        functions: 56, // measured 58.33
        branches: 76, // measured 78.57
        statements: 76, // measured 78.19
      },
    },
  },
});
