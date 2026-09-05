import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the transform builder/presets, the mock provider, the registry,
      // the circuit breaker, the signing primitives and the three vendor
      // adapters. Excluded: barrels, type and schema declarations, the startup
      // check that exits the process, and the logger and OTel shims.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/media/bootstrap.ts",
        "src/media/config.ts",
        "src/media/logger.ts",
        "src/media/metrics.ts",
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
        // Everything on the authentication path. `signatures.ts` fixes the
        // bytes of each construction; each adapter fixes which parameters are
        // signed, which of the account's two keys the digest is taken with,
        // and whether the string that was signed is the string that is sent.
        // A wrong answer to any of those is a 401 or 403 the vendor gives no
        // reason for, and the token or secret involved is a credential, so
        // every branch is exercised rather than most of them.
        "src/media/providers/signatures.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        "src/media/providers/cloudinary.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        "src/media/providers/imgix.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        "src/media/providers/uploadcare.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
      },
    },
  },
});
