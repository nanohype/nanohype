import { describe, it, expect } from "vitest";
import { getProvider, listProviders } from "@/lib/ai/providers";

describe("AI Provider Registry", () => {
  it("registers anthropic provider", () => {
    const provider = getProvider("anthropic");
    expect(provider).toBeDefined();
    expect(provider.defaultModel).toBe("claude-sonnet-4-20250514");
  });

  it("registers openai provider", () => {
    const provider = getProvider("openai");
    expect(provider).toBeDefined();
    expect(provider.defaultModel).toBe("gpt-4o");
  });

  it("throws for unknown provider", () => {
    expect(() => getProvider("nonexistent")).toThrow(
      'Unknown AI provider: "nonexistent"'
    );
  });

  it("lists all registered providers", () => {
    const providers = listProviders();
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
  });
});
