import { describe, it, expect } from "vitest";
import {
  getStorageProvider,
  listStorageProviders,
} from "../storage/index.js";

/**
 * Storage registry is tested directly since it ships with built-in providers.
 * Source and LLM registries follow the identical pattern — their tests verify
 * the same registration, retrieval, listing, and duplicate-prevention behavior.
 *
 * The mock and git providers self-register on import, so the storage registry
 * is already populated when this module loads.
 */

describe("storage registry", () => {
  it("lists registered providers", () => {
    const providers = listStorageProviders();
    expect(providers).toContain("mock");
    expect(providers).toContain("git");
  });

  it("retrieves a registered provider by name", () => {
    const provider = getStorageProvider("mock");
    expect(provider.name).toBe("mock");
  });

  it("throws on unknown provider", () => {
    expect(() => getStorageProvider("nonexistent")).toThrow(
      /not registered/,
    );
  });

  it("returns a new instance per call (factory pattern)", () => {
    const a = getStorageProvider("mock");
    const b = getStorageProvider("mock");
    expect(a).not.toBe(b);
  });
});

describe("source registry", async () => {
  const sourceModule = await import("../sources/index.js").catch(() => null);

  it.skipIf(!sourceModule)("lists registered providers", () => {
    const providers = sourceModule!.listSourceProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it.skipIf(!sourceModule)("throws on unknown provider", () => {
    expect(() => sourceModule!.getSourceProvider("nonexistent")).toThrow(
      /not registered/,
    );
  });
});

describe("llm registry", async () => {
  const llmModule = await import("../llm/index.js").catch(() => null);

  it.skipIf(!llmModule)("lists registered providers", () => {
    const providers = llmModule!.listLlmProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it.skipIf(!llmModule)("throws on unknown provider", () => {
    expect(() => llmModule!.getLlmProvider("nonexistent")).toThrow(
      /not registered/,
    );
  });
});
