import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text"],
      // Explicit include so modules with zero tests still count against the
      // floor — the gate measures the whole src/ surface, not just what the
      // suite happened to load.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: {
        // These are the org floor from standards/testing-rubric.json, not a
        // ratchet: this package is the vendorable source of truth for the
        // runtime primitives every tenant copies, and it measures well above
        // the bar already (97.03 / 89.80 / 96.66 / 98.05).
        lines: 75,
        functions: 75,
        branches: 60,
        statements: 75,

        // pii.ts is the redaction path — what keeps secrets and personal data
        // out of logs and traces. An uncovered branch there is a pattern that
        // was never proven to redact, which surfaces as a leak in somewhere
        // downstream rather than as a failure here.
        "src/pii.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
});
