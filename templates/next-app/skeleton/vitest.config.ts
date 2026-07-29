import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
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
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 83,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
