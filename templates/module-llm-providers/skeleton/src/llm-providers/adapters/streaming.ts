// ── Streaming Adapter ──────────────────────────────────────────────
//
// Converts provider-specific streaming formats into a unified
// AsyncIterable<StreamChunk>. Handles both native async iterables
// and callback-based streams.
//

import type { StreamChunk, StreamResponse } from "../types.js";

/**
 * Normalize any async iterable of string fragments into the unified
 * StreamChunk format. Useful when adapting third-party provider
 * streams that yield raw strings.
 */
export async function* normalizeStream(
  source: AsyncIterable<string>,
): AsyncGenerator<StreamChunk> {
  for await (const text of source) {
    yield { text, done: false };
  }
  yield { text: "", done: true };
}

/**
 * Collect all chunks from a StreamResponse into a single string.
 * Useful for testing or when you want streaming internally but need
 * the full text synchronously.
 */
export async function collectStream(stream: StreamResponse): Promise<string> {
  let result = "";
  for await (const chunk of stream) {
    if (chunk.done) break;
    result += chunk.text;
  }
  return result;
}

/**
 * Create a StreamResponse from a simple async generator of strings.
 * Wraps the generator in the standard StreamChunk format and provides
 * a response promise that resolves with the aggregated text.
 */
export function fromStringStream(
  source: AsyncIterable<string>,
  meta: { model: string; provider: string },
): StreamResponse {
  let resolveResponse: (value: import("../types.js").LlmResponse) => void;
  const responsePromise = new Promise<import("../types.js").LlmResponse>((resolve) => {
    resolveResponse = resolve;
  });

  async function* generate(): AsyncGenerator<StreamChunk> {
    const start = performance.now();
    let fullText = "";

    for await (const text of source) {
      fullText += text;
      yield { text, done: false };
    }

    yield { text: "", done: true };

    const latencyMs = performance.now() - start;
    resolveResponse!({
      text: fullText,
      model: meta.model,
      provider: meta.provider,
      usage: {
        inputTokens: 0,
        outputTokens: Math.ceil(fullText.length / 4),
      },
      latencyMs,
      cost: 0,
    });
  }

  const iterator = generate();

  return {
    [Symbol.asyncIterator]() {
      return iterator;
    },
    response: responsePromise,
  };
}
