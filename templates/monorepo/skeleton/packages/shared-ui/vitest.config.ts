import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      // Enabled here rather than behind a flag, so `npm test` is the gate. A
      // threshold that only applies when someone remembers `--coverage` is a
      // decoration, not a floor.
      enabled: true,
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // The floor published in nanohype/standards/testing-rubric.json. This
      // package is small enough to hold every line, so it does.
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100,
      },
    },
  },
});
