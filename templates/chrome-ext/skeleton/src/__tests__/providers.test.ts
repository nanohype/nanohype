import { beforeEach, describe, expect, it } from "vitest";
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

function stubProvider(reply = "stub response"): AiProvider {
  return { sendMessage: async () => reply };
}

const SETTINGS = { endpoint: "http://localhost:8080", route: "default" };

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

    registerProvider("gateway", () => stubProvider("from the gateway"));

    const result = getProvider("gateway");
    expect(await result.sendMessage([], SETTINGS)).toBe("from the gateway");
  });

  it("throws with a helpful message for an unknown provider", async () => {
    const { registerProvider, getProvider } = await freshRegistry();
    registerProvider("gateway", () => stubProvider());
    registerProvider("custom", () => stubProvider());

    expect(() => getProvider("cohere")).toThrowError(/Unknown AI provider: "cohere"/);
    expect(() => getProvider("cohere")).toThrowError(/Available:/);
  });

  it("lists all registered provider names", async () => {
    const { registerProvider, listProviders } = await freshRegistry();

    registerProvider("gateway", () => stubProvider());
    registerProvider("custom", () => stubProvider());

    const names = listProviders();
    expect(names).toEqual(expect.arrayContaining(["gateway", "custom"]));
    expect(names).toHaveLength(2);
  });

  it("returns a fresh instance on each getProvider call", async () => {
    const { registerProvider, getProvider } = await freshRegistry();

    registerProvider("test", () => stubProvider("fresh"));

    const a = getProvider("test");
    const b = getProvider("test");
    expect(a).not.toBe(b);
    expect(await a.sendMessage([], SETTINGS)).toBe("fresh");
  });
});
