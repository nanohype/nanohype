import { describe, it, expect } from "vitest";
import {
  registerProvider,
  getProvider,
  listProviders,
} from "../providers/registry.js";
import type { LlmProvider, LlmProviderFactory } from "../providers/types.js";

// ── Registry Tests ─────────────────────────────────────────────────
//
// Verifies the factory-based registry: each getProvider() call returns
// a new instance, factories can be registered and retrieved, and
// duplicate registration is rejected.
//

function stubFactory(name: string): LlmProviderFactory {
  return () => ({
    name,
    pricing: { input: 0, output: 0 },
    async chat() {
      return {
        text: "stub",
        model: "stub-model",
        provider: name,
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs: 0,
        cost: 0,
      };
    },
    streamChat() {
      async function* gen() {
        yield { text: "stub", done: true };
      }
      const iter = gen();
      return {
        [Symbol.asyncIterator]() { return iter; },
        response: Promise.resolve({
          text: "stub",
          model: "stub-model",
          provider: name,
          usage: { inputTokens: 0, outputTokens: 0 },
          latencyMs: 0,
          cost: 0,
        }),
      };
    },
    countTokens() { return 0; },
  });
}

describe("LLM provider registry", () => {
  const unique = () =>
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a factory and retrieves a provider instance by name", () => {
    const name = unique();
    registerProvider(name, stubFactory(name));

    const provider = getProvider(name);
    expect(provider.name).toBe(name);
  });

  it("returns independent instances from each getProvider() call", () => {
    const name = unique();
    registerProvider(name, stubFactory(name));

    const a = getProvider(name);
    const b = getProvider(name);
    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
  });

  it("throws when retrieving an unregistered provider", () => {
    expect(() => getProvider("nonexistent-provider")).toThrow(/not found/);
  });

  it("throws when registering a duplicate provider name", () => {
    const name = unique();
    registerProvider(name, stubFactory(name));

    expect(() => registerProvider(name, stubFactory(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered provider names", () => {
    const a = unique();
    const b = unique();

    registerProvider(a, stubFactory(a));
    registerProvider(b, stubFactory(b));

    const names = listProviders();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });

  it("lists built-in providers after barrel import", async () => {
    await import("../providers/index.js");
    const names = listProviders();

    expect(names).toContain("anthropic");
    expect(names).toContain("openai");
    expect(names).toContain("groq");
    expect(names).toContain("mock");
  });
});
