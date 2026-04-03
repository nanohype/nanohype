import { describe, it, expect } from "vitest";
import { createGatewayAdapter } from "../adapters/gateway.js";
import { normalizeStream, collectStream, fromStringStream } from "../adapters/streaming.js";
import { getProvider } from "../providers/registry.js";
import "../providers/mock.js";

// ── Adapter Tests ──────────────────────────────────────────────────
//
// Validates gateway adapter shape and streaming normalization.
//

describe("gateway adapter", () => {
  it("produces correct GatewayProvider shape", () => {
    const provider = getProvider("mock");
    const adapted = createGatewayAdapter(provider);

    expect(adapted.name).toBe("mock");
    expect(typeof adapted.chat).toBe("function");
    expect(typeof adapted.countTokens).toBe("function");
    expect(adapted.pricing).toEqual({ input: 0, output: 0 });
  });

  it("chat returns gateway-compatible response", async () => {
    const provider = getProvider("mock");
    const adapted = createGatewayAdapter(provider);

    const response = await adapted.chat([
      { role: "user", content: "hello" },
    ]);

    expect(response.text).toContain("Hello");
    expect(response.provider).toBe("mock");
    expect(response.model).toBe("mock-model");
    expect(typeof response.inputTokens).toBe("number");
    expect(typeof response.outputTokens).toBe("number");
    expect(typeof response.latencyMs).toBe("number");
    expect(response.cached).toBe(false);
    expect(typeof response.cost).toBe("number");
  });

  it("countTokens delegates to provider", () => {
    const provider = getProvider("mock");
    const adapted = createGatewayAdapter(provider);

    const count = adapted.countTokens("Hello, world!");
    expect(count).toBe(Math.ceil("Hello, world!".length / 4));
  });
});

describe("streaming adapter", () => {
  it("normalizeStream converts string iterable to StreamChunk", async () => {
    async function* source() {
      yield "Hello";
      yield " world";
    }

    const chunks: { text: string; done: boolean }[] = [];
    for await (const chunk of normalizeStream(source())) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { text: "Hello", done: false },
      { text: " world", done: false },
      { text: "", done: true },
    ]);
  });

  it("collectStream aggregates StreamResponse into string", async () => {
    const provider = getProvider("mock");
    const stream = provider.streamChat([
      { role: "user", content: "hello" },
    ]);

    const text = await collectStream(stream);
    expect(text).toContain("Hello");
  });

  it("fromStringStream creates a StreamResponse from async strings", async () => {
    async function* source() {
      yield "chunk1";
      yield "chunk2";
    }

    const stream = fromStringStream(source(), { model: "test", provider: "test" });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      if (chunk.done) break;
      chunks.push(chunk.text);
    }

    expect(chunks).toEqual(["chunk1", "chunk2"]);

    const response = await stream.response;
    expect(response.text).toBe("chunk1chunk2");
    expect(response.model).toBe("test");
    expect(response.provider).toBe("test");
  });
});
