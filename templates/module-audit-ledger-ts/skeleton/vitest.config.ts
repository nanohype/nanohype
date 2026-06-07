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
      // Pure logic carries the floor. The SDK-backed provider adapters
      // (dynamodb/sqs/postgres), the bootstrap, the OTel metrics shim, and the
      // barrels are exercised by integration tests / live SDKs, not unit-covered.
      exclude: [
        "src/**/*.test.ts",
        "src/audit/index.ts",
        "src/audit/bootstrap.ts",
        "src/audit/metrics.ts",
        "src/audit/providers/index.ts",
        "src/audit/providers/dynamodb.ts",
        "src/audit/providers/sqs.ts",
        "src/audit/providers/postgres.ts",
      ],
      // testing-rubric: enforce-floor-in-config. This is a security-critical
      // audit ledger, so the idempotency key derivation (event-id) is held to
      // 100% per the rubric's security-critical-100 rule; everything else to the
      // standard module floor.
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 70,
        "**/event-id.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
      },
    },
  },
});
