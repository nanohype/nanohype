import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/**/index.ts", "src/**/types.ts"],
      // Floors published in nanohype/standards/testing-rubric.json
      // (lines/functions/statements 75, branches 60). Signature verification
      // carries a per-file 100% override on top: every rejection path in the
      // receiver is a branch, and a branch nothing exercises is a forgery
      // nothing proves is refused.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
        "src/webhook/receiver.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
      },
    },
  },
});
