import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the local provider, the registry, the circuit breaker and the two
      // cloud providers. helpers.ts is the buffering and retry those two share;
      // the client delegates each call to a provider; bootstrap exits on an
      // unresolved placeholder.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/storage/bootstrap.ts",
        "src/storage/client.ts",
        "src/storage/providers/helpers.ts",
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
        // A presigned URL is a bearer credential: the bucket, key, method and
        // expiry that go into it are the whole access decision, and a signer
        // reached by an untested path grants whatever it was handed. Both
        // providers sign, so both are held to every line and every branch.
        "src/storage/providers/s3.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
        "src/storage/providers/r2.ts": {
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
      },
    },
  },
});
