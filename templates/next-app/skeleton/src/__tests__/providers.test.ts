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

  it("throws for unknown provider", () => {
    expect(() => getProvider("nonexistent")).toThrow('Unknown AI provider: "nonexistent"');
  });

  it("lists the gateway as the one built-in provider", () => {
    const providers = listProviders();
    expect(providers).toEqual(["gateway"]);
  });
});
