import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      // src/bin/nanohype.ts is the entry point: it spawns a child process and
      // calls process.exit at module load, so importing it under the runner
      // would kill the run. Its logic lives in src/resolve.ts, which is
      // covered here; what remains in the entry is process control, exercised
      // by actually running the binary rather than by importing it.
      exclude: ["src/bin/**"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
