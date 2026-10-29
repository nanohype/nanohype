import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LLM_PROVIDER, loadConfig } from "../ci-eval/config.js";

// ── Config Tests ────────────────────────────────────────────────────
//
// The eval workflow runs the CLI with no .env file loaded, so a run that
// names no provider calls the one the project was scaffolded with rather
// than failing validation.
//

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadConfig", () => {
  it("calls the scaffolded provider when LLM_PROVIDER is unset or empty", () => {
    vi.stubEnv("LLM_PROVIDER", undefined);
    expect(loadConfig().llmProvider).toBe(DEFAULT_LLM_PROVIDER);
    vi.stubEnv("LLM_PROVIDER", "");
    expect(loadConfig().llmProvider).toBe(DEFAULT_LLM_PROVIDER);
  });

  it("takes LLM_PROVIDER, then an override", () => {
    vi.stubEnv("LLM_PROVIDER", "gateway");
    expect(loadConfig().llmProvider).toBe("gateway");
    expect(loadConfig({ llmProvider: "bedrock" }).llmProvider).toBe("bedrock");
  });
});
