import { z } from "zod";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { parseTimeoutMs, withRequestTimeout } from "../resilience/request-timeout.js";
import { guardStream } from "../resilience/stream-guard.js";
import { countTokens } from "../tokens/counter.js";
import type { ChatMessage, ChatOptions, LlmResponse, Pricing, StreamResponse } from "../types.js";
import { estimateCost } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── Ollama Provider ────────────────────────────────────────────────
//
// Local inference via Ollama's OpenAI-compatible API. Zero SDK
// dependency — uses native fetch. Defaults to http://localhost:11434/v1.
// createOllamaProvider() returns an instance with its own circuit
// breaker; the registered `ollama` factory returns one such instance for
// the life of the process. Supports both request/response and streaming
// modes, and runs both through the circuit breaker under
// OLLAMA_REQUEST_TIMEOUT_MS (`requestTimeoutMs` sets it per instance): a
// request fails when its reply takes longer, and a stream when no event
// arrives for that long. Either way the request's abort signal fires,
// which drops the connection. resilience/request-timeout.ts gives the
// bound it puts on each mode.
//
// The setting is ollama's own, with a 600000 ms default, because local
// inference runs on whatever hardware hosts the server, often a CPU or a
// small GPU, and loads a model into memory on its first request. The
// default covers the 4096-token default at about 7 tokens a second.
//
// Sends the caller's `temperature`, and 1 when the caller sets none, and
// the caller's `topP` when one is set.
//
// Auth: None (local server).
//

const DEFAULT_MODEL = "llama3.2";

// Never trust raw model output — validate the JSON before reading fields.
// Ollama mirrors the OpenAI chat-completions shape; the parts we read are
// optional because a degraded server can omit them.
const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }).partial() })).optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .partial()
    .optional(),
});

const streamChunkSchema = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string() }).partial() })).optional(),
});

/** The request timeout when OLLAMA_REQUEST_TIMEOUT_MS is unset or empty, in milliseconds. */
export const DEFAULT_OLLAMA_REQUEST_TIMEOUT_MS = 600_000;

/** The request timeout OLLAMA_REQUEST_TIMEOUT_MS sets, in milliseconds. */
export const OLLAMA_REQUEST_TIMEOUT_MS = parseTimeoutMs(
  "OLLAMA_REQUEST_TIMEOUT_MS",
  process.env.OLLAMA_REQUEST_TIMEOUT_MS,
  DEFAULT_OLLAMA_REQUEST_TIMEOUT_MS,
);

/** The chat-completion chunks an SSE body carries, skipping any line that is not one. */
async function* sseChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<z.infer<typeof streamChunkSchema>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      let raw: unknown;
      try {
        raw = JSON.parse(data);
      } catch {
        continue; // Skip malformed SSE lines
      }
      const parsed = streamChunkSchema.safeParse(raw);
      if (!parsed.success) continue; // Skip off-shape SSE payloads
      yield parsed.data;
    }
  }
}

function getBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1").replace(/\/$/, "");
}

export interface OllamaProviderOptions {
  /**
   * How long a call waits on the model, in milliseconds: a whole request,
   * or each wait for a stream's next event. OLLAMA_REQUEST_TIMEOUT_MS when
   * unset.
   */
  requestTimeoutMs?: number;
}

/**
 * An Ollama provider instance with its own circuit breaker. The registered
 * `ollama` provider is one of these, built with no options.
 */
export function createOllamaProvider(options: OllamaProviderOptions = {}): LlmProvider {
  const requestTimeoutMs = options.requestTimeoutMs ?? OLLAMA_REQUEST_TIMEOUT_MS;
  const cb = createCircuitBreaker();
  const pricing: Pricing = { input: 0, output: 0 };

  return {
    name: "ollama",
    pricing,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      const start = performance.now();

      const response = await cb.execute(() =>
        withRequestTimeout(requestTimeoutMs, async (signal) => {
          const res = await fetch(`${getBaseUrl()}/chat/completions`, {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens,
              temperature,
              messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              ...(opts?.topP !== undefined ? { top_p: opts.topP } : {}),
              ...(opts?.stop ? { stop: opts.stop } : {}),
            }),
          });

          if (!res.ok) {
            throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
          }

          return completionSchema.parse(await res.json());
        }),
      );

      const latencyMs = performance.now() - start;
      const text = response.choices?.[0]?.message?.content ?? "";
      const usage = {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
      const cost = estimateCost(usage, pricing);

      logger.debug("ollama chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "ollama", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      return guardStream(cb, requestTimeoutMs, {
        async open(signal: AbortSignal) {
          const res = await fetch(`${getBaseUrl()}/chat/completions`, {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens,
              temperature,
              stream: true,
              messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              ...(opts?.topP !== undefined ? { top_p: opts.topP } : {}),
              ...(opts?.stop ? { stop: opts.stop } : {}),
            }),
          });

          if (!res.ok) {
            throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
          }

          return res.body ? sseChunks(res.body) : undefined;
        },
        text: (chunk) => chunk.choices?.[0]?.delta?.content,
        finish(text, latencyMs) {
          const usage = {
            inputTokens: countTokens(messages.map((m) => m.content).join(" ")),
            outputTokens: countTokens(text),
          };
          const cost = estimateCost(usage, pricing);
          return { text, model, provider: "ollama", usage, latencyMs, cost };
        },
      });
    },

    countTokens(text: string, model?: string): number {
      return countTokens(text, model);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker holds across requests.
const ollamaProvider = createOllamaProvider();
registerProvider("ollama", () => ollamaProvider);
