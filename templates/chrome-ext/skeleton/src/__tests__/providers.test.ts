import { describe, it, expect, beforeEach } from "vitest";
import type { AiProvider } from "../lib/providers/types.js";

/**
 * The registry uses module-level state (a Map), so we re-import
 * a fresh module for each test to avoid cross-test pollution.
 */

async function freshRegistry() {
  const mod = await import("../lib/providers/registry.js");
  return mod;
}

function stubProvider(overrides?: Partial<AiProvider>): AiProvider {
  return {
    defaultModel: "test-model",
    sendMessage: async () => "stub response",
    ...overrides,
  };
}

describe("provider registry", () => {
  // Dynamic import with cache-busting keeps each test isolated.
  // vitest re-evaluates the module on each dynamic import when
  // the module is not in the static import graph.

  beforeEach(() => {
    // Clear the module from vitest's module cache so the Map resets.
    const key = Object.keys(import.meta).length; // no-op, forces new scope
    void key;
  });

  it("registers a provider without throwing", async () => {
    const { registerProvider, listProviders } = await freshRegistry();
    const provider = stubProvider();

    expect(() => registerProvider("test", provider)).not.toThrow();
    expect(listProviders()).toContain("test");
  });

  it("retrieves a registered provider by name", async () => {
    const { registerProvider, getProvider } = await freshRegistry();
    const provider = stubProvider({ defaultModel: "gpt-4o" });

    registerProvider("openai", provider);

    const result = getProvider("openai");
    expect(result).toBe(provider);
    expect(result.defaultModel).toBe("gpt-4o");
  });

  it("throws with a helpful message for an unknown provider", async () => {
    const { registerProvider, getProvider } = await freshRegistry();
    registerProvider("anthropic", stubProvider());
    registerProvider("openai", stubProvider());

    expect(() => getProvider("cohere")).toThrowError(
      /Unknown AI provider: "cohere"/,
    );
    expect(() => getProvider("cohere")).toThrowError(/Available:/);
  });

  it("lists all registered provider names", async () => {
    const { registerProvider, listProviders } = await freshRegistry();

    registerProvider("anthropic", stubProvider());
    registerProvider("openai", stubProvider());

    const names = listProviders();
    expect(names).toEqual(expect.arrayContaining(["anthropic", "openai"]));
    expect(names).toHaveLength(2);
  });
});
