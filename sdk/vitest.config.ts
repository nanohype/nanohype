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
      exclude: [
        // CLI entry point — raw-arg dispatch + process.exit wiring, exercised
        // end-to-end by running the binary, not unit-testable in isolation.
        "src/bin/nanohype.ts",
      ],
      // Honest floors set just below the measured actuals (see the numbers in
      // the comment on each threshold) so the gate catches a regression — a
      // new untested module dragging the denominator down — without flaking
      // on minor fluctuation. Run via `npm run test:coverage`.
      thresholds: {
        lines: 90, // measured 95.11
        functions: 96, // measured 98.79
        branches: 80, // measured 86.92
        statements: 88, // measured 93.90

        // The two files that decide whether a caller-supplied name reaches the
        // filesystem carry 100% of their own, above the global floor. A name
        // arrives from an LLM tool argument, so the question these answer is
        // whether a crafted one is refused — and a branch nobody exercised is a
        // refusal nobody proved.
        //
        // local.ts holds `resolveWithin`, which rejects a null byte and asserts
        // the resolved path stays inside the base directory. It guards
        // fetchTemplate, fetchComposite, fetchStandard and fetchContract, and
        // each of those is a separate way in.
        "src/sources/local.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },

        // paths.ts holds both containment decisions — `resolveWithin` for a
        // name resolved against a directory this process owns, and
        // `assertDescendingPath` for a rendered path handed to a caller who
        // supplies the directory later. It is the only thing standing between
        // a substituted variable value and a write outside the output tree, so
        // every refusal branch is exercised rather than merely present.
        "src/paths.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },

        // validator.ts holds `isCatalogName`, the same boundary reached the
        // other way: GitHubSource interpolates a name into a request path, so
        // the pattern is what stops a name reshaping the URL.
        "src/validator.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
});
