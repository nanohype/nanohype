import { describe, it, expect, beforeEach } from "vitest";
import type { AiProvider } from "../ai/providers/types";

/**
 * Tests the provider registry in isolation. The registry is a pure
 * Map-backed store with no VS Code dependencies, so it can run
 * directly under Vitest.
 *
 * We re-import the module for every test to get a fresh Map.
 */

function makeFakeProvider(model = "fake-model-1"): AiProvider {
  return {
    defaultModel: model,
    async sendMessage() {
      return "fake-response";
    },
  };
}

describe("provider registry", () => {
  let registerProvider: typeof import("../ai/providers/registry").registerProvider;
  let getProvider: typeof import("../ai/providers/registry").getProvider;
  let listProviders: typeof import("../ai/providers/registry").listProviders;

  beforeEach(async () => {
    // Dynamic import with cache-bust so each test gets a fresh module
    // (and therefore a fresh Map).
    const mod = await import(`../ai/providers/registry?t=${Date.now()}`);
    registerProvider = mod.registerProvider;
    getProvider = mod.getProvider;
    listProviders = mod.listProviders;
  });

  it("registers and retrieves a provider", () => {
    const provider = makeFakeProvider();
    registerProvider("test-provider", provider);
    expect(getProvider("test-provider")).toBe(provider);
  });

  it("lists registered providers", () => {
    registerProvider("alpha", makeFakeProvider());
    registerProvider("beta", makeFakeProvider("beta-model"));
    expect(listProviders()).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect(listProviders()).toHaveLength(2);
  });

  it("throws for an unknown provider", () => {
    expect(() => getProvider("nonexistent")).toThrowError(/Unknown AI provider/);
  });

  it("includes available providers in the error message", () => {
    registerProvider("only-one", makeFakeProvider());
    try {
      getProvider("missing");
    } catch (err) {
      expect((err as Error).message).toContain("only-one");
    }
  });

  it("overwrites a provider when re-registered with the same name", () => {
    const first = makeFakeProvider("v1");
    const second = makeFakeProvider("v2");
    registerProvider("dup", first);
    registerProvider("dup", second);
    expect(getProvider("dup").defaultModel).toBe("v2");
  });
});
