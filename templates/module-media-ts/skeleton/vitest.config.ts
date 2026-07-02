import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
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
      // Floors sit just below measured coverage so the gate catches
      // regressions; ratchet upward as the suite grows.
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 85,
      },
    },
  },
});
