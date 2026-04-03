import { describe, it, expect, beforeEach } from "vitest";
import type { GatewayProvider } from "../providers/types.js";
import type { ChatMessage, GatewayResponse, ChatOptions } from "../types.js";

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
    const { registerProvider, getProvider, listProviders } = await import(
      "../providers/registry.js"
    );

    // Avoid double-registration errors by checking first
    if (!listProviders().includes("test-gw")) {
      registerProvider(createTestProvider("test-gw"));
    }

    // Register minimal routing and caching strategies
    const { registerStrategy } = await import("../routing/registry.js");
    const { registerCachingStrategy } = await import("../caching/registry.js");

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

  it("passes tags through to cost tracker", async () => {
    const { registerProvider, listProviders } = await import("../providers/registry.js");

    if (!listProviders().includes("test-tags")) {
      registerProvider(createTestProvider("test-tags"));
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
