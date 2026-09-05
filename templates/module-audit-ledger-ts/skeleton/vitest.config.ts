import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // testing-rubric: enforce-floor-in-config, security-critical-100. The
      // module floor is the baseline; the rubric names audit ledgers, so every
      // module that carries behaviour on the append or query path is pinned at
      // 100% branch/line/function above it. The adapters are pinned through the
      // client or pool their config accepts, so the pin holds without a live
      // backend. The type-only modules (types.ts) declare no behaviour to pin.
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        branches: 60,
        "src/audit/index.ts": { 100: true },
        "src/audit/bootstrap.ts": { 100: true },
        "src/audit/event-id.ts": { 100: true },
        "src/audit/metrics.ts": { 100: true },
        "src/audit/providers/index.ts": { 100: true },
        "src/audit/providers/registry.ts": { 100: true },
        "src/audit/providers/memory.ts": { 100: true },
        "src/audit/providers/dynamodb.ts": { 100: true },
        "src/audit/providers/postgres.ts": { 100: true },
        "src/audit/providers/sqs.ts": { 100: true },
      },
    },
  },
});
