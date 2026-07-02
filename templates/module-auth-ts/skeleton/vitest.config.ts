import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
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
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 72,
        functions: 82,
        statements: 72,
        branches: 75,
      },
    },
  },
});
