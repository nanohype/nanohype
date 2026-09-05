import { describe, expect, it, vi } from "vitest";
import { getProvider, listProviders, registerProvider } from "../providers/index.js";

describe("adapter registry", () => {
  it("registers all four built-in adapters", () => {
    const names = listProviders();
    for (const name of ["memory", "postgres", "dynamodb", "sqs"]) {
      expect(names).toContain(name);
    }
  });

  it("returns a fresh adapter by name", () => {
    expect(getProvider("memory").name).toBe("memory");
  });

  it("throws for an unknown adapter", () => {
    expect(() => getProvider("nope")).toThrow(/not found/);
  });

  it("refuses to re-register a name", () => {
    expect(() => registerProvider("memory", () => getProvider("memory"))).toThrow(
      /already registered/,
    );
  });

  it("names no adapters before any has registered", async () => {
    vi.resetModules();
    const empty = await import("../providers/registry.js");
    expect(empty.listProviders()).toEqual([]);
    expect(() => empty.getProvider("memory")).toThrow(/Available: \(none\)/);
  });
});
