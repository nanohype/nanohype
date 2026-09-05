import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // What stays out of the denominator, and why: the test files themselves;
      // the `types.ts` modules, which declare interfaces and hold no runtime
      // statement; the `index.ts` barrels, which re-export and pull in the
      // provider modules for their registration side effect; the route
      // modules, which are Hono handlers over the operations covered here, and
      // `server.ts`, which mounts them and bridges Node's http server to the
      // app; `src/cli/`, whose entry parses argv and dispatches at import and
      // whose commands wrap the library for a terminal; `config.ts`, which
      // reads the environment; `wiki/index-manager.ts`; and the adapters that
      // reach a real system — `llm/anthropic.ts` calls the Messages API,
      // `sources/local.ts` reads a source tree on disk, and `storage/git.ts`
      // commits to a checkout.
      //
      // Three kinds of file are deliberately not among them.
      //
      // The eval corpus loader is measured. The eval runner and the fixture
      // wiki it seeds reach a live model, so those run on demand; the loader's
      // refusal to report a pass over an empty corpus needs no model and is
      // held by the unit suite.
      //
      // The `mock.ts` providers ship. A project selects them through
      // WIKI_LLM_PROVIDER, WIKI_SOURCE_PROVIDER and WIKI_STORAGE_PROVIDER, and
      // they carry the branches it runs on before it configures a backend — a
      // keyword dispatch, a missing-page refusal, a prefix-narrowed listing,
      // and the per-tenant partition that is the whole of the isolation
      // between tenants in the in-memory store. They are not doubles the suite
      // reaches for: the doubles are objects declared in the test files and
      // installed with `vi.mock` over the barrels.
      //
      // `tenant/auth.ts` and `api/middleware/auth.ts` decide which requests
      // reach any of it, and what a tenant's users may read and write.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/api/server.ts",
        "src/api/routes/**",
        "src/cli/**",
        "src/config.ts",
        "src/eval/fixture-storage.ts",
        "src/eval/runner.ts",
        "src/llm/anthropic.ts",
        "src/sources/local.ts",
        "src/storage/git.ts",
        "src/wiki/index-manager.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // The floor published in nanohype/standards/testing-rubric.json. A
      // scaffolded project starts held to the same bar it will be graded
      // against; raise these as the suite grows, never lower them.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
        // Access control decides what a tenant's users can read and write, so
        // the standard holds it to every branch rather than the floor.
        "src/tenant/auth.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
        // #if IncludeApi
        "src/api/middleware/auth.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        // #endif
        // The three in-memory providers are held to every line and every
        // branch, above the floor, because they are the whole of what a
        // project runs on until it configures a backend. Pinned rather than
        // measured: the text reporter prints no row for a file already at
        // 100%, so a provider that slipped would leave the aggregate looking
        // much as it does here and nothing would say which file moved.
        "src/llm/mock.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
        "src/sources/mock.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
        "src/storage/mock.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
      },
    },
  },
});
