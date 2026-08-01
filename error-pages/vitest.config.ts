import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      // src/bin/ is the entry point: it reads process.argv and calls
      // process.exit at module load, so importing it under the runner would
      // kill the run. Its logic is the same `checkErrorPage` / `writeSitePages`
      // covered here; what remains is argument parsing and process control,
      // exercised by actually running the binary rather than by importing it.
      //
      // src/vitest.ts registers a matcher via expect.extend at import time.
      // It is exercised in matcher.test.ts, but v8 attributes the coverage to
      // the setup phase rather than the test, so it is excluded and asserted
      // behaviourally instead.
      exclude: ["src/bin/**", "src/vitest.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
