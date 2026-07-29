import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the guards, JWT provider, registry, and circuit breaker.
      // SDK-backed providers (auth0/clerk/supabase), the apikey/mock providers,
      // and framework middleware are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/auth/bootstrap.ts",
        "src/auth/middleware.ts",
        "src/auth/providers/apikey.ts",
        "src/auth/providers/auth0.ts",
        "src/auth/providers/clerk.ts",
        "src/auth/providers/supabase.ts",
        "src/auth/providers/mock.ts",
        "src/**/index.ts",
        "src/**/types.ts",
      ],
      // The floor published in nanohype/standards/testing-rubric.json. A
      // scaffolded project starts held to the same bar it will be graded
      // against; raise these as the suite grows, never lower them.
      thresholds: {
        lines: 75,
        functions: 82,
        statements: 75,
        branches: 75,
      },
    },
  },
});
