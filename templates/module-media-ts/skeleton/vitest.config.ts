import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the transform builder/presets, mock provider, registry, and
      // circuit breaker. SDK-backed providers (cloudinary/imgix/uploadcare) and
      // wiring are integration-exercised.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/media/bootstrap.ts",
        "src/media/config.ts",
        "src/media/logger.ts",
        "src/media/metrics.ts",
        "src/media/providers/cloudinary.ts",
        "src/media/providers/imgix.ts",
        "src/media/providers/uploadcare.ts",
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
});
