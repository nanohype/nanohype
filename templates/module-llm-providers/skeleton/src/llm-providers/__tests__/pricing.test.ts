import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING, getPricing, pricingKey } from "../types.js";

// A reply names its model as the provider reports it: a Bedrock
// inference-profile ID or foundation-model ID, with a geo prefix, a provider
// prefix, a snapshot date and a version suffix, or the vendor's alias. The
// pricing table lists each model once, by its alias, so every one of those
// forms has to reach the same row. One that misses prices the call at zero,
// which reads as a free model to anything routing by cost.

describe("pricingKey", () => {
  it.each([
    ["us.anthropic.claude-haiku-4-5-20251001-v1:0", "claude-haiku-4-5"],
    ["us.anthropic.claude-sonnet-5", "claude-sonnet-5"],
    ["us.anthropic.claude-opus-5", "claude-opus-5"],
    ["anthropic.claude-haiku-4-5-20251001-v1:0", "claude-haiku-4-5"],
    ["claude-sonnet-5", "claude-sonnet-5"],
    ["gpt-4.1-mini", "gpt-4.1-mini"],
    ["gemini-2.0-flash", "gemini-2.0-flash"],
    ["llama-3.3-70b-versatile", "llama-3.3-70b-versatile"],
  ])("keys %s as %s", (model, key) => {
    expect(pricingKey(model)).toBe(key);
  });
});

describe("getPricing", () => {
  it("prices an inference-profile ID at its model's rate", () => {
    expect(getPricing("us.anthropic.claude-haiku-4-5-20251001-v1:0")).toEqual(
      DEFAULT_PRICING["claude-haiku-4-5"],
    );
    expect(getPricing("us.anthropic.claude-opus-5")).toEqual(DEFAULT_PRICING["claude-opus-5"]);
  });

  it("prices a model the table does not list at zero", () => {
    expect(getPricing("us.example.unlisted-model-v1:0")).toEqual({ input: 0, output: 0 });
  });
});
