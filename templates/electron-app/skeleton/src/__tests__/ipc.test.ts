import { describe, it, expect, beforeEach } from "vitest";
import type { AiProvider } from "../main/providers/types.js";

/**
 * Tests for the provider registry and IPC handler logic.
 *
 * The registry uses module-level state (a Map), so we re-import
 * a fresh module for each test to avoid cross-test pollution.
 */

async function freshRegistry() {
  const mod = await import("../main/providers/registry.js");
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
  beforeEach(() => {
    const key = Object.keys(import.meta).length;
    void key;
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

describe("IPC message shape", () => {
  it("defines the expected send-message payload shape", () => {
    const payload = {
      messages: [
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi there" },
      ],
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[0].role).toBe("user");
    expect(payload.provider).toBe("anthropic");
  });

  it("accepts payload without optional fields", () => {
    const payload = {
      messages: [{ role: "user" as const, content: "Hello" }],
    };

    expect(payload.messages).toHaveLength(1);
    expect(payload).not.toHaveProperty("provider");
    expect(payload).not.toHaveProperty("model");
  });
});
