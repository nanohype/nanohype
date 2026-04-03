// ── LLM Tracer ─────────────────────────────────────────────────────
//
// Wraps any async LLM call with span capture. Records start time,
// invokes the function, records end time, and extracts model/provider/
// token counts from the response. Returns both the response and the
// captured span for downstream export and cost recording.
//

import { randomUUID } from "node:crypto";
import type { LlmResponse, LlmSpan } from "../types.js";
import type { TracerOptions } from "./types.js";

export type { TracerOptions, SpanContext } from "./types.js";

/**
 * Create an LLM tracer instance. All state is scoped to the
 * returned object — no module-level mutable state.
 */
export function createLlmTracer(options: TracerOptions) {
  const defaultTags = options.defaultTags ?? {};

  /**
   * Trace an async function that returns an LlmResponse.
   *
   * Captures timing, token counts, model, provider, and success/error
   * status. Returns both the original response and the captured span.
   *
   * @param fn - Async function that calls an LLM and returns LlmResponse.
   * @param tags - Per-call tags merged with defaults.
   */
  async function trace(
    fn: () => Promise<LlmResponse>,
    tags: Record<string, string> = {},
  ): Promise<{ response: LlmResponse; span: LlmSpan }> {
    const id = randomUUID();
    const startedAt = new Date();
    const mergedTags = { ...defaultTags, ...tags };

    try {
      const response = await fn();
      const endedAt = new Date();
      const durationMs = endedAt.getTime() - startedAt.getTime();

      const span: LlmSpan = {
        id,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs,
        model: response.model,
        provider: response.provider,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: 0, // Set by observer if cost tracking is enabled
        success: true,
        tags: mergedTags,
      };

      return { response, span };
    } catch (error) {
      const endedAt = new Date();
      const durationMs = endedAt.getTime() - startedAt.getTime();

      const span: LlmSpan = {
        id,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs,
        model: "unknown",
        provider: "unknown",
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        tags: mergedTags,
      };

      return { response: { text: "", model: "unknown", provider: "unknown", inputTokens: 0, outputTokens: 0 }, span };
    }
  }

  return { trace };
}

export type LlmTracer = ReturnType<typeof createLlmTracer>;
