import { describe, it, expect, beforeEach } from "vitest";
import type { GatewayProvider } from "../providers/types.js";
import type { RoutingContext } from "../routing/types.js";

// ── Routing Strategy Tests ──────────────────────────────────────────

function makeMockProvider(name: string, inputPrice = 1, outputPrice = 1): GatewayProvider {
  return {
    name,
    pricing: { input: inputPrice, output: outputPrice },
    async chat() {
      return {
        text: `response from ${name}`,
        model: "mock",
        provider: name,
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 100,
        cached: false,
        cost: 0,
      };
    },
    countTokens(text: string) {
      return Math.ceil(text.length / 4);
    },
  };
}

const defaultContext: RoutingContext = { prompt: "test prompt" };

describe("static strategy", () => {
  it("selects the first provider", async () => {
    // Import triggers factory self-registration
    await import("../routing/static.js");
    const { getStrategy } = await import("../routing/registry.js");

    const strategy = getStrategy("static");
    const providers = [makeMockProvider("a"), makeMockProvider("b")];
    const selected = strategy.select(providers, defaultContext);
    expect(selected.name).toBe("a");
  });

  it("returns the only provider when list has one", async () => {
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("static");
    const providers = [makeMockProvider("only")];
    const selected = strategy.select(providers, defaultContext);
    expect(selected.name).toBe("only");
  });

  it("throws when no providers available", async () => {
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("static");
    expect(() => strategy.select([], defaultContext)).toThrow("No providers available");
  });
});

describe("round-robin strategy", () => {
  it("rotates through providers", async () => {
    await import("../routing/round-robin.js");
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("round-robin");
    const providers = [makeMockProvider("a"), makeMockProvider("b"), makeMockProvider("c")];

    const selections: string[] = [];
    for (let i = 0; i < 6; i++) {
      selections.push(strategy.select(providers, defaultContext).name);
    }

    // Should cycle through a, b, c, a, b, c
    expect(selections[0]).not.toBe(selections[1]);
    expect(selections[3]).toBe(selections[0]);
  });
});

describe("latency strategy", () => {
  it("selects the provider with lowest p50 latency", async () => {
    await import("../routing/latency.js");
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("latency");
    const providers = [makeMockProvider("slow"), makeMockProvider("fast")];

    // Record latency data
    for (let i = 0; i < 20; i++) {
      strategy.recordOutcome?.("slow", 500, true);
      strategy.recordOutcome?.("fast", 100, true);
    }

    const selected = strategy.select(providers, defaultContext);
    expect(selected.name).toBe("fast");
  });

  it("falls back to first provider with no data", async () => {
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("latency");
    const providers = [
      makeMockProvider("unknown-a"),
      makeMockProvider("unknown-b"),
    ];
    const selected = strategy.select(providers, defaultContext);
    expect(selected.name).toBe("unknown-a");
  });
});

describe("cost strategy", () => {
  it("selects the cheapest provider", async () => {
    await import("../routing/cost.js");
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("cost");
    const providers = [
      makeMockProvider("expensive", 10, 30),
      makeMockProvider("cheap", 0.5, 1),
    ];

    const selected = strategy.select(providers, defaultContext);
    expect(selected.name).toBe("cheap");
  });
});

describe("adaptive strategy", () => {
  it("falls back to first provider with insufficient data", async () => {
    await import("../routing/adaptive.js");
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("adaptive");
    const providers = [makeMockProvider("first"), makeMockProvider("second")];

    const selected = strategy.select(providers, defaultContext);
    expect(selected.name).toBe("first");
  });

  it("exploits the best provider after enough data", async () => {
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("adaptive");
    const providers = [makeMockProvider("bad"), makeMockProvider("good")];

    // Feed enough data to pass MIN_SAMPLES threshold
    for (let i = 0; i < 20; i++) {
      strategy.recordOutcome?.("bad", 500, false);
      strategy.recordOutcome?.("good", 100, true);
    }

    // With epsilon=0.1, the majority of selections should be "good"
    let goodCount = 0;
    for (let i = 0; i < 100; i++) {
      const selected = strategy.select(providers, defaultContext);
      if (selected.name === "good") goodCount++;
    }

    // Should select "good" at least 80% of the time (90% exploit + some explore hits)
    expect(goodCount).toBeGreaterThan(70);
  });
});

describe("linucb strategy", () => {
  it("falls back to first provider with insufficient data", async () => {
    await import("../routing/linucb.js");
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("linucb");
    const providers = [makeMockProvider("first"), makeMockProvider("second")];

    const selected = strategy.select(providers, defaultContext);
    expect(selected.name).toBe("first");
  });

  it("converges on the better provider after training", async () => {
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("linucb");
    const providers = [makeMockProvider("bad"), makeMockProvider("good")];

    // Use select() → recordOutcome() flow so feature vectors are cached
    for (let i = 0; i < 20; i++) {
      strategy.select(providers, defaultContext);
      strategy.recordOutcome?.("bad", 500, false);
      strategy.select(providers, defaultContext);
      strategy.recordOutcome?.("good", 100, true);
    }

    // LinUCB is deterministic (no epsilon randomness) — the better
    // provider should be selected consistently once data is sufficient.
    let goodCount = 0;
    for (let i = 0; i < 50; i++) {
      const selected = strategy.select(providers, defaultContext);
      if (selected.name === "good") goodCount++;
    }

    expect(goodCount).toBeGreaterThan(40);
  });

  it("selects different providers for different task types", async () => {
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("linucb");
    const providers = [makeMockProvider("coder"), makeMockProvider("chatter")];

    const codeContext: RoutingContext = {
      prompt: "write a function",
      features: { taskType: "code" },
    };
    const chatContext: RoutingContext = {
      prompt: "hello how are you",
      features: { taskType: "chat" },
    };

    // Train: "coder" succeeds fast on code, fails on chat;
    //        "chatter" succeeds fast on chat, fails on code.
    for (let i = 0; i < 30; i++) {
      strategy.select(providers, codeContext);
      strategy.recordOutcome?.("coder", 80, true);
      strategy.select(providers, codeContext);
      strategy.recordOutcome?.("chatter", 500, false);

      strategy.select(providers, chatContext);
      strategy.recordOutcome?.("chatter", 80, true);
      strategy.select(providers, chatContext);
      strategy.recordOutcome?.("coder", 500, false);
    }

    // After contextual training, LinUCB should route code→coder, chat→chatter
    const codeSelection = strategy.select(providers, codeContext);
    const chatSelection = strategy.select(providers, chatContext);

    expect(codeSelection.name).toBe("coder");
    expect(chatSelection.name).toBe("chatter");
  });

  it("throws when no providers available", async () => {
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("linucb");
    expect(() => strategy.select([], defaultContext)).toThrow("No providers available for routing");
  });
});
