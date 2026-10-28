import { describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import type { GatewayProvider } from "../providers/types.js";
import type { ChatMessage, ChatOptions, GatewayResponse } from "../types.js";

// ── Gateway Integration Tests ───────────────────────────────────────
//
// Tests the full gateway flow: cache miss -> route -> call provider ->
// record cost -> cache store -> cache hit on second call.
//
// Uses a custom mock provider to avoid external API calls.
//

function createTestProvider(name: string): GatewayProvider {
  let callCount = 0;

  return {
    name,
    pricing: { input: 2, output: 8 },
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse> {
      callCount++;
      const text = `Response #${callCount} from ${name}`;
      return {
        text,
        model: opts?.model ?? "test-model",
        provider: name,
        inputTokens: 50,
        outputTokens: 25,
        latencyMs: 50,
        cached: false,
        cost: (50 * 2) / 1_000_000 + (25 * 8) / 1_000_000,
      };
    },
    countTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },
  };
}

describe("gateway integration", () => {
  it("calls provider on cache miss and returns from cache on second call", async () => {
    // Register a test provider directly
    const { registerProvider, listProviders } = await import("../providers/registry.js");

    // Avoid double-registration errors by checking first
    if (!listProviders().includes("test-gw")) {
      registerProvider("test-gw", () => createTestProvider("test-gw"));
    }

    // Ensure strategies are registered (barrels may have already loaded them)
    try {
      await import("../routing/static.js");
    } catch {
      // Already registered
    }
    try {
      await import("../caching/hash.js");
    } catch {
      // Already registered
    }

    const { createGateway } = await import("../index.js");

    const gateway = createGateway({
      providers: ["test-gw"],
      routingStrategy: "static",
      cachingStrategy: "hash",
    });

    const messages: ChatMessage[] = [{ role: "user", content: "Hello!" }];

    // First call — cache miss
    const response1 = await gateway.chat(messages);
    expect(response1.text).toContain("test-gw");
    expect(response1.cached).toBe(false);
    expect(response1.provider).toBe("test-gw");

    // Second call with same messages — should be a cache hit
    const response2 = await gateway.chat(messages);
    expect(response2.cached).toBe(true);
    expect(response2.text).toBe(response1.text);

    // Cost tracking should have recorded the first call
    const costs = gateway.getCosts();
    expect(costs.totalRequests).toBe(1); // Only the non-cached call is recorded

    await gateway.close();
  });

  it("falls through to the next provider when the first fails", async () => {
    const { registerProvider, listProviders } = await import("../providers/registry.js");

    if (!listProviders().includes("fail-first")) {
      registerProvider(
        "fail-first",
        (): GatewayProvider => ({
          name: "fail-first",
          pricing: { input: 1, output: 1 },
          async chat(): Promise<GatewayResponse> {
            throw new Error("provider down");
          },
          countTokens: (text: string) => Math.ceil(text.length / 4),
        }),
      );
    }
    if (!listProviders().includes("fallback-ok")) {
      registerProvider("fallback-ok", () => createTestProvider("fallback-ok"));
    }

    const { createGateway } = await import("../index.js");

    const gateway = createGateway({
      providers: ["fail-first", "fallback-ok"],
      routingStrategy: "static",
      cachingStrategy: "none",
    });

    const messages: ChatMessage[] = [{ role: "user", content: "Need a fallback" }];
    const response = await gateway.chat(messages);

    // Static routing picks "fail-first" first; its failure falls through to
    // the next configured provider, so the response comes from "fallback-ok".
    expect(response.provider).toBe("fallback-ok");
    expect(response.text).toContain("fallback-ok");

    await gateway.close();
  });

  it("throws when every provider in the fallback chain fails", async () => {
    const { registerProvider, listProviders } = await import("../providers/registry.js");

    const downProvider = (name: string): GatewayProvider => ({
      name,
      pricing: { input: 1, output: 1 },
      async chat(): Promise<GatewayResponse> {
        throw new Error(`${name} is down`);
      },
      countTokens: (text: string) => Math.ceil(text.length / 4),
    });

    if (!listProviders().includes("down-a"))
      registerProvider("down-a", () => downProvider("down-a"));
    if (!listProviders().includes("down-b"))
      registerProvider("down-b", () => downProvider("down-b"));

    const { createGateway } = await import("../index.js");

    const gateway = createGateway({
      providers: ["down-a", "down-b"],
      routingStrategy: "static",
      cachingStrategy: "none",
    });

    const messages: ChatMessage[] = [{ role: "user", content: "all down" }];
    await expect(gateway.chat(messages)).rejects.toThrow("is down");

    await gateway.close();
  });

  it("passes tags through to cost tracker", async () => {
    const { registerProvider, listProviders } = await import("../providers/registry.js");

    if (!listProviders().includes("test-tags")) {
      registerProvider("test-tags", () => createTestProvider("test-tags"));
    }

    const { createGateway } = await import("../index.js");

    const gateway = createGateway({
      providers: ["test-tags"],
      routingStrategy: "static",
      cachingStrategy: "none",
    });

    const messages: ChatMessage[] = [{ role: "user", content: "Tag test" }];
    await gateway.chat(messages, { tags: { user: "alice", project: "test" } });

    const costs = gateway.getCosts({ tags: { user: "alice" } });
    expect(costs.totalRequests).toBe(1);
    expect(costs.byUser["alice"]).toBeGreaterThan(0);
    expect(costs.byProject["test"]).toBeGreaterThan(0);

    await gateway.close();
  });
});

describe("gateway response cache key", () => {
  // The cache is checked before routing, so the key carries a temperature
  // when any provider that could serve the request sends one. These use
  // providers that declare what they send, and count the calls that reach
  // them: a call is a cache miss.

  /** A provider that counts its calls and sends `temperature` unless `drops` says not. */
  function countingProvider(name: string, drops?: (model?: string) => boolean) {
    const calls: ChatOptions[] = [];
    const provider: GatewayProvider = {
      ...createTestProvider(name),
      async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse> {
        calls.push({ ...opts });
        return createTestProvider(name).chat(messages, opts);
      },
    };
    if (drops) {
      provider.sampling = (opts) => (drops(opts.model) ? {} : { temperature: opts.temperature });
    }
    return { provider, calls };
  }

  async function gatewayOver(
    providers: GatewayProvider[],
    models?: Record<string, string>,
  ): Promise<Gateway> {
    const { registerProvider, listProviders } = await import("../providers/registry.js");
    for (const provider of providers) {
      if (!listProviders().includes(provider.name)) {
        registerProvider(provider.name, () => provider);
      }
    }
    const { createGateway } = await import("../index.js");
    return createGateway({
      providers: providers.map((p) => p.name),
      routingStrategy: "static",
      cachingStrategy: "hash",
      models,
    });
  }

  const messages: ChatMessage[] = [{ role: "user", content: "Same prompt." }];

  it("does not split entries on a temperature the provider drops", async () => {
    const dropper = countingProvider("key-drops", () => true);
    const gateway = await gatewayOver([dropper.provider]);

    await gateway.chat(messages, { temperature: 0.2 });
    const second = await gateway.chat(messages, { temperature: 0.7 });

    expect(dropper.calls).toHaveLength(1);
    expect(second.cached).toBe(true);
    await gateway.close();
  });

  it("keys on temperature for a provider that declares nothing", async () => {
    const sender = countingProvider("key-sends");
    const gateway = await gatewayOver([sender.provider]);

    await gateway.chat(messages, { temperature: 0.2 });
    const second = await gateway.chat(messages, { temperature: 0.7 });
    const third = await gateway.chat(messages, { temperature: 0.2 });

    expect(sender.calls).toHaveLength(2);
    expect(second.cached).toBe(false);
    expect(third.cached).toBe(true);
    await gateway.close();
  });

  it("keys on temperature while any candidate sends it, and not once the request names the dropper", async () => {
    const dropper = countingProvider("mixed-drops", () => true);
    const sender = countingProvider("mixed-sends");
    const gateway = await gatewayOver([dropper.provider, sender.provider]);

    await gateway.chat(messages, { temperature: 0.2 });
    await gateway.chat(messages, { temperature: 0.7 });
    expect(dropper.calls).toHaveLength(2);

    const forced = await gateway.chat(messages, { temperature: 0.9, provider: "mixed-drops" });
    expect(forced.cached).toBe(false);
    const forcedAgain = await gateway.chat(messages, { temperature: 0.1, provider: "mixed-drops" });
    expect(forcedAgain.cached).toBe(true);
    expect(dropper.calls).toHaveLength(3);
    expect(sender.calls).toHaveLength(0);
    await gateway.close();
  });

  it("decides from the model the config names for the provider", async () => {
    const byModel = countingProvider("key-by-model", (model) => model === "no-sampling-model");
    const gateway = await gatewayOver([byModel.provider], {
      "key-by-model": "no-sampling-model",
    });

    await gateway.chat(messages, { temperature: 0.2 });
    const second = await gateway.chat(messages, { temperature: 0.7 });

    expect(byModel.calls).toHaveLength(1);
    expect(byModel.calls[0].model).toBe("no-sampling-model");
    expect(second.cached).toBe(true);
    await gateway.close();
  });
});
