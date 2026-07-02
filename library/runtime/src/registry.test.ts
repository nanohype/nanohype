import { describe, it, expect } from "vitest";
import { createRegistry } from "./registry.js";

interface FakeProvider {
  kind: string;
}

describe("createRegistry", () => {
  it("registers and resolves providers by name", () => {
    const registry = createRegistry<FakeProvider>("llm");
    registry.register("bedrock", () => ({ kind: "bedrock" }));

    expect(registry.get("bedrock")).toEqual({ kind: "bedrock" });
  });

  it("invokes the factory on every get (fresh instance per lookup)", () => {
    const registry = createRegistry<FakeProvider>("llm");
    registry.register("bedrock", () => ({ kind: "bedrock" }));

    const a = registry.get("bedrock");
    const b = registry.get("bedrock");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("throws an actionable error naming the kind and available providers", () => {
    const registry = createRegistry<FakeProvider>("embedding");
    registry.register("bedrock", () => ({ kind: "bedrock" }));
    registry.register("openai", () => ({ kind: "openai" }));

    expect(() => registry.get("cohere")).toThrow(
      'Unknown embedding provider "cohere". Available: bedrock, openai',
    );
  });

  it("reports <none> when the registry is empty", () => {
    const registry = createRegistry<FakeProvider>("vector-store");

    expect(() => registry.get("pgvector")).toThrow(
      'Unknown vector-store provider "pgvector". Available: <none>',
    );
  });

  it("answers has() without invoking factories", () => {
    const registry = createRegistry<FakeProvider>("llm");
    let invoked = 0;
    registry.register("bedrock", () => {
      invoked++;
      return { kind: "bedrock" };
    });

    expect(registry.has("bedrock")).toBe(true);
    expect(registry.has("openai")).toBe(false);
    expect(invoked).toBe(0);
  });

  it("lists registered names in registration order", () => {
    const registry = createRegistry<FakeProvider>("llm");
    registry.register("bedrock", () => ({ kind: "bedrock" }));
    registry.register("anthropic", () => ({ kind: "anthropic" }));

    expect(registry.names()).toEqual(["bedrock", "anthropic"]);
  });

  it("lets a later registration override an earlier one", () => {
    const registry = createRegistry<FakeProvider>("llm");
    registry.register("bedrock", () => ({ kind: "v1" }));
    registry.register("bedrock", () => ({ kind: "v2" }));

    expect(registry.get("bedrock")).toEqual({ kind: "v2" });
    expect(registry.names()).toEqual(["bedrock"]);
  });
});
