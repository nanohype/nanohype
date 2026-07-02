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
 * Thrown by the tracer when the wrapped LLM call fails. Carries the captured
 * error span (so the observer can still export it and record metrics) and the
 * original error as `cause`. The tracer never swallows a failure into a fake
 * success response — callers always see the real error.
 */
export class TracedError extends Error {
  constructor(
    public readonly span: LlmSpan,
    public readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "TracedError";
  }
}

/**
 * Create an LLM tracer instance. All state is scoped to the
 * returned object — no module-level mutable state.
 */
export function createLlmTracer(options: TracerOptions) {
  const defaultTags = options.defaultTags ?? {};
  const now = options.now ?? Date.now;

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
    const startedAt = new Date(now());
    const mergedTags = { ...defaultTags, ...tags };

    try {
      const response = await fn();
      const endedAt = new Date(now());
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
      const endedAt = new Date(now());
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

      // Surface the failure — hand the error span to the caller for export, but
      // never fabricate a success-shaped (empty-text) response.
      throw new TracedError(span, error);
    }
  }

  return { trace };
}

export type LlmTracer = ReturnType<typeof createLlmTracer>;
