import { describe, it, expect, beforeEach } from "vitest";
import type { AiProvider } from "../lib/providers/types.js";

/**
 * The registry uses module-level state (a Map). An earlier version tried
 * to re-import the module via dynamic import to get a fresh Map, but Node's
 * ESM loader doesn't honor cache-bust query strings for file:// URLs — the
 * Map leaked across tests. We now explicitly clear it in beforeEach.
 */

async function freshRegistry() {
  const mod = await import("../lib/providers/registry.js");
  mod._clearRegistry();
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
  beforeEach(async () => {
    const mod = await import("../lib/providers/registry.js");
    mod._clearRegistry();
  });

  it("registers a factory without throwing", async () => {
    const { registerProvider, listProviders } = await freshRegistry();
    const provider = stubProvider();

    expect(() => registerProvider("test", () => provider)).not.toThrow();
    expect(listProviders()).toContain("test");
  });

  it("retrieves a provider by name from its factory", async () => {
    const { registerProvider, getProvider } = await freshRegistry();

    registerProvider("openai", () => stubProvider({ defaultModel: "gpt-4o" }));

    const result = getProvider("openai");
    expect(result.defaultModel).toBe("gpt-4o");
  });

  it("throws with a helpful message for an unknown provider", async () => {
    const { registerProvider, getProvider } = await freshRegistry();
    registerProvider("anthropic", () => stubProvider());
    registerProvider("openai", () => stubProvider());

    expect(() => getProvider("cohere")).toThrowError(
      /Unknown AI provider: "cohere"/,
    );
    expect(() => getProvider("cohere")).toThrowError(/Available:/);
  });

  it("lists all registered provider names", async () => {
    const { registerProvider, listProviders } = await freshRegistry();

    registerProvider("anthropic", () => stubProvider());
    registerProvider("openai", () => stubProvider());

    const names = listProviders();
    expect(names).toEqual(expect.arrayContaining(["anthropic", "openai"]));
    expect(names).toHaveLength(2);
  });

  it("returns a fresh instance on each getProvider call", async () => {
    const { registerProvider, getProvider } = await freshRegistry();

    registerProvider("test", () => stubProvider({ defaultModel: "fresh" }));

    const a = getProvider("test");
    const b = getProvider("test");
    expect(a).not.toBe(b);
    expect(a.defaultModel).toBe("fresh");
  });
});
