import { describe, it, expect } from "vitest";
import { countTokens } from "../tokens/counter.js";

// ── Token Counter Tests ────────────────────────────────────────────

describe("countTokens", () => {
  it("counts tokens in a simple string", () => {
    const count = countTokens("Hello, world!");
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });

  it("returns higher count for longer text", () => {
    const short = countTokens("Hi");
    const long = countTokens("This is a much longer sentence that should have more tokens.");
    expect(long).toBeGreaterThan(short);
  });

  it("handles empty string", () => {
    const count = countTokens("");
    expect(count).toBe(0);
  });

  it("handles multiline text", () => {
    const text = "Line one.\nLine two.\nLine three.";
    const count = countTokens(text);
    expect(count).toBeGreaterThan(5);
  });

  it("accepts an optional model parameter", () => {
    const count = countTokens("Hello, world!", "gpt-4o");
    expect(count).toBeGreaterThan(0);
  });

  it("handles unknown model by falling back to default encoding", () => {
    const count = countTokens("Hello, world!", "unknown-model");
    expect(count).toBeGreaterThan(0);
  });

  it("returns consistent counts for the same input", () => {
    const a = countTokens("The quick brown fox jumps over the lazy dog.");
    const b = countTokens("The quick brown fox jumps over the lazy dog.");
    expect(a).toBe(b);
  });

  it("counts different models consistently when both fall back", () => {
    const a = countTokens("Hello", "claude-sonnet-4-20250514");
    const b = countTokens("Hello", "some-unknown-model");
    // Both fall back to gpt-4o encoding, should be equal
    expect(a).toBe(b);
  });
});
