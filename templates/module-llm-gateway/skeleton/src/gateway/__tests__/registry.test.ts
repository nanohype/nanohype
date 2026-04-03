import { describe, it, expect } from "vitest";

// ── Registry Tests ──────────────────────────────────────────────────
//
// Verifies all three registries: provider, routing, and caching.
// Ensures self-registration works and all built-in implementations
// are discoverable.
//

describe("provider registry", () => {
  it("lists all built-in providers after barrel import", async () => {
    await import("../providers/index.js");
    const { listProviders } = await import("../providers/registry.js");
    const providers = listProviders();

    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toContain("groq");
    expect(providers).toContain("mock");
  });

  it("retrieves a registered provider by name", async () => {
    const { getProvider } = await import("../providers/registry.js");
    const provider = getProvider("mock");
    expect(provider.name).toBe("mock");
    expect(typeof provider.chat).toBe("function");
    expect(typeof provider.countTokens).toBe("function");
  });

  it("throws for unknown provider", async () => {
    const { getProvider } = await import("../providers/registry.js");
    expect(() => getProvider("nonexistent")).toThrow("not found");
  });
});

describe("routing strategy registry", () => {
  it("lists all built-in strategies after barrel import", async () => {
    await import("../routing/index.js");
    const { listStrategies } = await import("../routing/registry.js");
    const strategies = listStrategies();

    expect(strategies).toContain("static");
    expect(strategies).toContain("round-robin");
    expect(strategies).toContain("latency");
    expect(strategies).toContain("cost");
    expect(strategies).toContain("adaptive");
  });

  it("retrieves a registered strategy by name", async () => {
    const { getStrategy } = await import("../routing/registry.js");
    const strategy = getStrategy("static");
    expect(strategy.name).toBe("static");
    expect(typeof strategy.select).toBe("function");
  });

  it("throws for unknown strategy", async () => {
    const { getStrategy } = await import("../routing/registry.js");
    expect(() => getStrategy("nonexistent")).toThrow("not found");
  });
});

describe("caching strategy registry", () => {
  it("lists all built-in strategies after barrel import", async () => {
    await import("../caching/index.js");
    const { listCachingStrategies } = await import("../caching/registry.js");
    const strategies = listCachingStrategies();

    expect(strategies).toContain("hash");
    expect(strategies).toContain("sliding-ttl");
    expect(strategies).toContain("none");
  });

  it("retrieves a registered caching strategy by name", async () => {
    const { getCachingStrategy } = await import("../caching/registry.js");
    const strategy = getCachingStrategy("hash");
    expect(strategy.name).toBe("hash");
    expect(typeof strategy.get).toBe("function");
    expect(typeof strategy.set).toBe("function");
  });

  it("throws for unknown caching strategy", async () => {
    const { getCachingStrategy } = await import("../caching/registry.js");
    expect(() => getCachingStrategy("nonexistent")).toThrow("not found");
  });
});
