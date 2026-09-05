import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Excluded: type-only modules, which compile to no runtime code, and
      // the modules that stand between the process and the gateway —
      // placeholder guard, environment parsing, console logger, meter
      // handles.
      //
      // `src/gateway/index.ts` is not one of them. It decides which
      // middleware each route mounts, so it decides whether an
      // authentication step runs at all and what that step is given. It is
      // measured, and pinned below.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/gateway/bootstrap.ts",
        "src/gateway/config.ts",
        "src/gateway/logger.ts",
        "src/gateway/metrics.ts",
        "src/gateway/types.ts",
        "src/gateway/router/types.ts",
      ],
      // Pinned at what the suite measures, above the floor published in
      // nanohype/standards/testing-rubric.json (lines, functions and
      // statements 75, branches 60). Raise these as the suite grows, never
      // lower them.
      //
      // Rule `security-critical-100` in the same standard puts the entry
      // point above that floor by name. Every gate in front of the proxy —
      // auth, circuit breaker, upstream health — is a branch in that file,
      // and a branch nothing exercises is a request nothing proves is
      // refused.
      thresholds: {
        lines: 90,
        functions: 91,
        statements: 89,
        branches: 86,
        "src/gateway/index.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
      },
    },
  },
});
