import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Excluded: type-only modules, which compile to no runtime code, and
      // the providers barrel, whose statements are all re-exports.
      //
      // `src/auth/index.ts` is not a barrel: it calls `validateBootstrap()` at
      // import, which is a statement that runs. It sits on the auth path, so it
      // is measured and pinned below.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/auth/providers/index.ts",
        "src/**/types.ts",
      ],
      // The floor published in nanohype/standards/testing-rubric.json. A
      // scaffolded project starts held to the same bar it will be graded
      // against; raise these as the suite grows, never lower them.
      //
      // Rule `security-critical-100` in the same standard puts the files
      // named below above that floor: a security-critical path is measured
      // whole, so no part of it may be met by a smaller surface.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
        "src/auth/index.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
        "src/auth/bootstrap.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
        "src/auth/middleware.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
        "src/auth/providers/apikey.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        "src/auth/providers/auth0.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        "src/auth/providers/clerk.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        "src/auth/providers/mock.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        "src/auth/providers/supabase.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
      },
    },
  },
});
