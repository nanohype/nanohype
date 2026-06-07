import { describe, it, expect } from "vitest";
import { getProvider, listProviders } from "../providers/index.js";

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
});
