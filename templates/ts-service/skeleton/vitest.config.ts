import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the reusable scaffolding (middleware, domain, health/readiness,
      // metrics). Excluded: wiring/bootstrap (index, bootstrap, app, config,
      // telemetry), generated/openapi surfaces, type decls, and the `example.*`
      // demo handlers a consumer replaces.
      exclude: [
        "src/**/*.test.ts",
        "src/__tests__/**",
        "src/index.ts",
        "src/bootstrap.ts",
        "src/app.ts",
        "src/config.ts",
        "src/telemetry/**",
        "src/openapi.ts",
        "src/routes/openapi.ts",
        "src/routes/example.ts",
        "src/services/example.ts",
        "src/schemas/example.ts",
        "src/types/**",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
      },
    },
  },
});
