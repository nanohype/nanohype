import { describe, it, expect } from "vitest";
import { createLlmTracer } from "../tracer/index.js";
import type { LlmResponse } from "../types.js";

// ── LLM Tracer Tests ───────────────────────────────────────────────

function makeResponse(overrides: Partial<LlmResponse> = {}): LlmResponse {
  return {
    text: "Hello, world!",
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
    inputTokens: 100,
    outputTokens: 50,
    ...overrides,
  };
}

describe("LLM tracer", () => {
  it("wraps an async LLM call and captures a span", async () => {
    const tracer = createLlmTracer({ serviceName: "test-service" });

    const { response, span } = await tracer.trace(
      async () => makeResponse(),
    );

    expect(response.text).toBe("Hello, world!");
    expect(span.model).toBe("claude-sonnet-4-20250514");
    expect(span.provider).toBe("anthropic");
    expect(span.inputTokens).toBe(100);
    expect(span.outputTokens).toBe(50);
    expect(span.success).toBe(true);
    expect(span.error).toBeUndefined();
    expect(span.durationMs).toBeGreaterThanOrEqual(0);
    expect(span.id).toBeDefined();
    expect(span.startedAt).toBeDefined();
    expect(span.endedAt).toBeDefined();
  });

  it("records duration accurately", async () => {
    const tracer = createLlmTracer({ serviceName: "test-service" });

    const { span } = await tracer.trace(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return makeResponse();
    });

    expect(span.durationMs).toBeGreaterThanOrEqual(40);
    expect(span.durationMs).toBeLessThan(200);
  });

  it("captures errors without throwing", async () => {
    const tracer = createLlmTracer({ serviceName: "test-service" });

    const { response, span } = await tracer.trace(async () => {
      throw new Error("LLM provider timeout");
    });

    expect(span.success).toBe(false);
    expect(span.error).toBe("LLM provider timeout");
    expect(span.model).toBe("unknown");
    expect(span.provider).toBe("unknown");
    expect(response.text).toBe("");
  });

  it("merges default tags with per-call tags", async () => {
    const tracer = createLlmTracer({
      serviceName: "test-service",
      defaultTags: { environment: "test", team: "platform" },
    });

    const { span } = await tracer.trace(
      async () => makeResponse(),
      { user: "alice", team: "overridden" },
    );

    expect(span.tags["environment"]).toBe("test");
    expect(span.tags["user"]).toBe("alice");
    // Per-call tags override defaults
    expect(span.tags["team"]).toBe("overridden");
  });

  it("generates unique span IDs", async () => {
    const tracer = createLlmTracer({ serviceName: "test-service" });
    const ids = new Set<string>();

    for (let i = 0; i < 10; i++) {
      const { span } = await tracer.trace(async () => makeResponse());
      ids.add(span.id);
    }

    expect(ids.size).toBe(10);
  });

  it("captures different model and provider from response", async () => {
    const tracer = createLlmTracer({ serviceName: "test-service" });

    const { span } = await tracer.trace(async () =>
      makeResponse({ model: "gpt-4o", provider: "openai", inputTokens: 200, outputTokens: 100 }),
    );

    expect(span.model).toBe("gpt-4o");
    expect(span.provider).toBe("openai");
    expect(span.inputTokens).toBe(200);
    expect(span.outputTokens).toBe(100);
  });
});
