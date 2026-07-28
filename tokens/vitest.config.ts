import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      // The mirror is data, and the parity test compares all of it against the
      // stylesheet — statement coverage of a `const` object says nothing that
      // the parity gate does not already say better.
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
