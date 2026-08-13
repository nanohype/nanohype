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
      // React components/pages, SDK providers, auth/db config, and wiring are
      // exercised by e2e, not unit coverage.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/logger.ts",
        "src/app/api/readyz/**",
        "src/lib/ai/providers/anthropic.ts",
        "src/lib/ai/providers/openai.ts",
        "src/lib/auth/**",
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
