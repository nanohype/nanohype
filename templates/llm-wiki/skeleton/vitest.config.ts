import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate operations, schema parsing, wiki search/link-graph/page logic,
      // the registries, and the circuit breaker. Out of the denominator: the
      // HTTP API and the CLI; `config.ts`, which reads the environment; the
      // adapters that reach a real system — `llm/anthropic.ts` the Messages
      // API, `sources/local.ts` a source tree on disk, `storage/git.ts` a
      // checkout; `tenant/auth.ts` and `wiki/index-manager.ts`; and the
      // barrels and type-only modules.
      //
      // The `mock.ts` providers are measured. They ship, a project selects
      // them through WIKI_LLM_PROVIDER, WIKI_SOURCE_PROVIDER and
      // WIKI_STORAGE_PROVIDER, and they carry the branches a project runs on
      // before it configures a backend — a keyword dispatch, a missing-page
      // refusal, a prefix-narrowed listing, and the per-tenant partition that
      // is the whole of the isolation between tenants in the in-memory store.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/config.ts",
        "src/api/**",
        "src/cli/**",
        "src/llm/anthropic.ts",
        "src/sources/local.ts",
        "src/storage/git.ts",
        "src/tenant/auth.ts",
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
