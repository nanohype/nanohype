import { describe, it, expect } from "vitest";
import { getProvider } from "../providers/registry.js";
import "../providers/mock.js";

// ── Mock Provider Tests ────────────────────────────────────────────
//
// Validates keyword matching, streaming, token counting, and pricing
// for the deterministic mock provider.
//

describe("mock provider", () => {
  function getMock() {
    return getProvider("mock");
  }

  it("returns keyword-matched response for 'hello'", async () => {
    const provider = getMock();
    const response = await provider.chat([
      { role: "user", content: "hello" },
    ]);

    expect(response.text).toContain("Hello");
    expect(response.provider).toBe("mock");
    expect(response.model).toBe("mock-model");
  });

  it("returns keyword-matched response for 'code'", async () => {
    const provider = getMock();
    const response = await provider.chat([
      { role: "user", content: "Write some code" },
    ]);

    expect(response.text).toContain("function");
  });

  it("returns default response for unmatched keywords", async () => {
    const provider = getMock();
    const response = await provider.chat([
      { role: "user", content: "xyzzy" },
    ]);

    expect(response.text).toContain("mock response");
  });

  it("respects model override in options", async () => {
    const provider = getMock();
    const response = await provider.chat(
      [{ role: "user", content: "hello" }],
      { model: "custom-model" },
    );

    expect(response.model).toBe("custom-model");
  });

  it("reports fake token counts based on text length", async () => {
    const provider = getMock();
    const response = await provider.chat([
      { role: "user", content: "hello" },
    ]);

    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
  });

  it("has zero pricing", () => {
    const provider = getMock();
    expect(provider.pricing.input).toBe(0);
    expect(provider.pricing.output).toBe(0);
  });

  it("has zero cost", async () => {
    const provider = getMock();
    const response = await provider.chat([
      { role: "user", content: "hello" },
    ]);
    expect(response.cost).toBe(0);
  });

  it("counts tokens approximately (4 chars per token)", () => {
    const provider = getMock();
    const count = provider.countTokens("Hello, world!");
    expect(count).toBe(Math.ceil("Hello, world!".length / 4));
  });

  describe("streaming", () => {
    it("yields chunks word-by-word", async () => {
      const provider = getMock();
      const stream = provider.streamChat([
        { role: "user", content: "hello" },
      ]);

      const chunks: string[] = [];
      for await (const chunk of stream) {
        if (chunk.done) break;
        chunks.push(chunk.text);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join("")).toContain("Hello");
    });

    it("provides complete response after stream finishes", async () => {
      const provider = getMock();
      const stream = provider.streamChat([
        { role: "user", content: "hello" },
      ]);

      // Consume the stream
      for await (const chunk of stream) {
        if (chunk.done) break;
      }

      const response = await stream.response;
      expect(response.text).toContain("Hello");
      expect(response.provider).toBe("mock");
      expect(response.usage.inputTokens).toBeGreaterThan(0);
    });
  });

  it("creates independent instances (factory pattern)", () => {
    const a = getMock();
    const b = getMock();
    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
  });
});
