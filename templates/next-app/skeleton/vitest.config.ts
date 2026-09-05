import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vitest 4 transforms with oxc, not esbuild, and an `esbuild` block here is
  // ignored with a notice rather than rejected — so the .tsx suites reach the
  // parser with JSX left as-is and fail on the first tag. The runtime has to be
  // declared on the transformer actually in use, and as an object: the bare
  // string "automatic" is a Vite-level value oxc's types reject, and dropping
  // the block entirely falls back to preserving JSX rather than transforming
  // it. Both of those fail, in different places.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the chat API route, streaming helpers, and provider registry.
      // Out of the denominator: the React components and pages, which need a
      // DOM and a Next runtime; the SDK providers, which need a vendor key;
      // the Drizzle schema and client, which describe a database rather than
      // behaving; and the layout and wiring modules.
      //
      // Nothing under `lib/auth/` is among them. `options.ts` holds the
      // `authorized` callback every protected route rests on, and `config.ts`
      // is the construction that wires it into NextAuth. Both are measured and
      // pinned below.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/logger.ts",
        "src/app/api/readyz/**",
        "src/lib/ai/providers/anthropic.ts",
        "src/lib/ai/providers/openai.ts",
        "src/lib/db/**",
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
        // The authorization callback decides what a signed-out visitor
        // reaches, so the standard holds it to every branch, not the floor.
        "src/lib/auth/config.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        "src/lib/auth/options.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
      },
    },
  },
  resolve: {
    alias: {
      // import.meta.dirname, not __dirname: Vite's native config loader cannot
      // supply the CommonJS globals, and it is on its way to being the default.
      "@": resolve(import.meta.dirname, "src"),
    },
  },
});
