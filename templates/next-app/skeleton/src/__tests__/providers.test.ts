import { describe, expect, it } from "vitest";
import { getProvider, listProviders } from "@/lib/ai/providers";

describe("AI Provider Registry", () => {
  it("registers gateway provider", () => {
    const provider = getProvider("gateway");
    expect(provider).toBeDefined();
    expect(provider.defaultModel).toBe("default");
    expect(provider.resolveModel("gpt-4o")).toBe("default");
    expect(provider.resolveModel()).toBe("default");
  });
  // #if IncludeKeyProviders

  it("registers anthropic provider", () => {
    const provider = getProvider("anthropic");
    expect(provider).toBeDefined();
    expect(provider.defaultModel).toBe("claude-sonnet-5");
    expect(provider.resolveModel("claude-opus-5")).toBe("claude-opus-5");
    expect(provider.resolveModel()).toBe("claude-sonnet-5");
  });

  it("registers openai provider", () => {
    const provider = getProvider("openai");
    expect(provider).toBeDefined();
    expect(provider.defaultModel).toBe("gpt-4o");
    expect(provider.resolveModel("gpt-4.1")).toBe("gpt-4.1");
    expect(provider.resolveModel()).toBe("gpt-4o");
  });
  // #endif

  it("throws for unknown provider", () => {
    expect(() => getProvider("nonexistent")).toThrow('Unknown AI provider: "nonexistent"');
  });

  it("lists all registered providers", () => {
    const providers = listProviders();
    expect(providers).toContain("gateway");
    // #if IncludeKeyProviders
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    // #endif
  });
});
