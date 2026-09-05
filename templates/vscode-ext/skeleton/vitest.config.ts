import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      // Out of the denominator: bootstrap.ts and extension.ts, which run at
      // activation and exit the process; client.ts, a pass-through to whichever
      // provider the registry returns; the anthropic and openai providers,
      // which need a vendor key; the React app, whose entry mounts into a DOM
      // the extension host owns; panel.ts, which builds its HTML from VS Code
      // webview URIs; and the barrels and type-only modules.
      //
      // The message protocol and the React app stay in. The first is the
      // routing between the two processes, where a message with no case is
      // dropped in silence; the second is the half of that seam living in the
      // component, which no test of the routing reaches.
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/bootstrap.ts",
        "src/extension.ts",
        "src/ai/client.ts",
        "src/ai/providers/anthropic.ts",
        "src/ai/providers/openai.ts",
        "src/webview/app/index.tsx",
        "src/webview/panel.ts",
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
