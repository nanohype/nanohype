import { z } from "zod";
import type { LlmProvider } from "./types.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  StreamResponse,
  StreamChunk,
  Pricing,
} from "../types.js";
import { estimateCost } from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { countTokens } from "../tokens/counter.js";
import { logger } from "../logger.js";

// ── Ollama Provider ────────────────────────────────────────────────
//
// Local inference via Ollama's OpenAI-compatible API. Zero SDK
// dependency — uses native fetch. Defaults to http://localhost:11434/v1.
// Each factory call returns a new instance with its own circuit breaker.
//
// Auth: None (local server).
//

const DEFAULT_MODEL = "llama3.2";

// Never trust raw model output — validate the JSON before reading fields.
// Ollama mirrors the OpenAI chat-completions shape; the parts we read are
// optional because a degraded server can omit them.
const completionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }).partial() }))
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .partial()
    .optional(),
});

const streamChunkSchema = z.object({
  choices: z
    .array(z.object({ delta: z.object({ content: z.string() }).partial() }))
    .optional(),
});

function getBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1").replace(/\/$/, "");
}

function createOllamaProvider(): LlmProvider {
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

      const response = await cb.execute(async () => {
        const res = await fetch(`${getBaseUrl()}/chat/completions`, {
          method: "POST",
          signal: AbortSignal.timeout(300_000),
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
      });

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

      let resolveResponse: (value: LlmResponse) => void;
      const responsePromise = new Promise<LlmResponse>((resolve) => {
        resolveResponse = resolve;
      });

      async function* generate(): AsyncGenerator<StreamChunk> {
        const start = performance.now();
        let fullText = "";

        const res = await fetch(`${getBaseUrl()}/chat/completions`, {
          method: "POST",
          signal: AbortSignal.timeout(300_000),
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

        const reader = res.body?.getReader();
        if (!reader) {
          yield { text: "", done: true };
          resolveResponse!({
            text: "",
            model,
            provider: "ollama",
            usage: { inputTokens: 0, outputTokens: 0 },
            latencyMs: performance.now() - start,
            cost: 0,
          });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

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
            const delta = parsed.data.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              yield { text: delta, done: false };
            }
          }
        }

        yield { text: "", done: true };

        const latencyMs = performance.now() - start;
        const usage = {
          inputTokens: countTokens(messages.map((m) => m.content).join(" ")),
          outputTokens: countTokens(fullText),
        };
        const cost = estimateCost(usage, pricing);

        resolveResponse!({
          text: fullText,
          model,
          provider: "ollama",
          usage,
          latencyMs,
          cost,
        });
      }

      const iterator = generate();

      return {
        [Symbol.asyncIterator]() {
          return iterator;
        },
        response: responsePromise,
      };
    },

    countTokens(text: string, model?: string): number {
      return countTokens(text, model);
    },
  };
}

// Self-register factory
registerProvider("ollama", createOllamaProvider);
