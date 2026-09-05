import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Gate the mock provider, registry, and circuit breaker. Excluded:
      // bootstrap.ts exits the process on an unresolved placeholder, config.ts
      // is a Zod schema, logger.ts and metrics.ts are console and OTel sinks,
      // and the vendor providers reach a live API under a host token.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/project-mgmt/bootstrap.ts",
        "src/project-mgmt/config.ts",
        "src/project-mgmt/logger.ts",
        "src/project-mgmt/metrics.ts",
        "src/project-mgmt/providers/asana.ts",
        "src/project-mgmt/providers/jira.ts",
        "src/project-mgmt/providers/linear.ts",
        "src/project-mgmt/providers/shortcut.ts",
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
