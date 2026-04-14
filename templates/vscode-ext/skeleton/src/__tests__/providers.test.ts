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
  let _clearRegistry: typeof import("../ai/providers/registry")._clearRegistry;

  beforeEach(async () => {
    // Node's ESM loader does not honor the `?t=...` query-string cache-bust
    // the earlier version relied on, so the module-level Map leaks across
    // tests. Explicitly clear instead — deterministic and doesn't depend on
    // loader internals.
    const mod = await import("../ai/providers/registry");
    registerProvider = mod.registerProvider;
    getProvider = mod.getProvider;
    listProviders = mod.listProviders;
    _clearRegistry = mod._clearRegistry;
    _clearRegistry();
  });

  it("registers a factory and retrieves a provider", () => {
    registerProvider("test-provider", () => makeFakeProvider());
    const result = getProvider("test-provider");
    expect(result.defaultModel).toBe("fake-model-1");
  });

  it("lists registered providers", () => {
    registerProvider("alpha", () => makeFakeProvider());
    registerProvider("beta", () => makeFakeProvider("beta-model"));
    expect(listProviders()).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect(listProviders()).toHaveLength(2);
  });

  it("throws for an unknown provider", () => {
    expect(() => getProvider("nonexistent")).toThrowError(/Unknown AI provider/);
  });

  it("includes available providers in the error message", () => {
    registerProvider("only-one", () => makeFakeProvider());
    try {
      getProvider("missing");
    } catch (err) {
      expect((err as Error).message).toContain("only-one");
    }
  });

  it("overwrites a factory when re-registered with the same name", () => {
    registerProvider("dup", () => makeFakeProvider("v1"));
    registerProvider("dup", () => makeFakeProvider("v2"));
    expect(getProvider("dup").defaultModel).toBe("v2");
  });

  it("returns a fresh instance on each getProvider call", () => {
    registerProvider("fresh", () => makeFakeProvider());
    const a = getProvider("fresh");
    const b = getProvider("fresh");
    expect(a).not.toBe(b);
    expect(a.defaultModel).toBe("fake-model-1");
  });
});
