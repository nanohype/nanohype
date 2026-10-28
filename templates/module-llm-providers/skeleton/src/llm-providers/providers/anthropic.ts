import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { countTokens } from "../tokens/counter.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  Pricing,
  StreamChunk,
  StreamResponse,
} from "../types.js";
import { estimateCost, getPricing } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── Anthropic Provider ─────────────────────────────────────────────
//
// Claude via the @anthropic-ai/sdk. Each factory call returns a new
// instance with its own lazily-initialized SDK client and circuit
// breaker. Supports both request/response and streaming modes.
//
// Auth: ANTHROPIC_API_KEY environment variable (read by the SDK).
//
// No Claude model receives `temperature`, `top_p` or `top_k`, whether
// through this provider or through Bedrock. The Messages API rejects
// them at any value, the default included, so neither request mode sends
// them whatever `opts.temperature` and `opts.topP` hold. The Bedrock
// provider leaves them out for Claude model ids too; bedrock.ts gives the
// Bedrock reason.
//

const DEFAULT_MODEL = "claude-sonnet-5";

function createAnthropicProvider(): LlmProvider {
  let client: Anthropic | null = null;
  const cb = createCircuitBreaker();

  function getClient(): Anthropic {
    if (!client) {
      client = new Anthropic();
    }
    return client;
  }

  const pricing: Pricing = getPricing(DEFAULT_MODEL);

  // The first request that sets a sampling option says, at debug level,
  // that it was not sent.
  let droppedSamplingLogged = false;
  function noteDroppedSampling(opts?: ChatOptions): void {
    if (droppedSamplingLogged) return;
    if (opts?.temperature === undefined && opts?.topP === undefined) return;
    droppedSamplingLogged = true;
    logger.debug("anthropic sends no sampling options", {
      temperature: opts.temperature,
      topP: opts.topP,
    });
  }

  return {
    name: "anthropic",
    pricing,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      noteDroppedSampling(opts);

      const systemParts = messages.filter((m) => m.role === "system");
      const conversationParts = messages.filter((m) => m.role !== "system");
      const systemPrompt = systemParts.map((m) => m.content).join("\n\n");

      const start = performance.now();

      const response = await cb.execute(() =>
        getClient().messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt || undefined,
          messages: conversationParts.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          ...(opts?.stop ? { stop_sequences: opts.stop } : {}),
        }),
      );

      const latencyMs = performance.now() - start;
      const usage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      };

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => ("text" in block ? block.text : ""))
        .join("");

      const modelPricing = getPricing(model);
      const cost = estimateCost(usage, modelPricing);

      logger.debug("anthropic chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "anthropic", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      noteDroppedSampling(opts);

      const systemParts = messages.filter((m) => m.role === "system");
      const conversationParts = messages.filter((m) => m.role !== "system");
      const systemPrompt = systemParts.map((m) => m.content).join("\n\n");

      let resolveResponse: (value: LlmResponse) => void;
      const responsePromise = new Promise<LlmResponse>((resolve) => {
        resolveResponse = resolve;
      });

      async function* generate(): AsyncGenerator<StreamChunk> {
        const start = performance.now();
        let fullText = "";

        const stream = getClient().messages.stream({
          model,
          max_tokens: maxTokens,
          system: systemPrompt || undefined,
          messages: conversationParts.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          ...(opts?.stop ? { stop_sequences: opts.stop } : {}),
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            fullText += text;
            yield { text, done: false };
          }
        }

        yield { text: "", done: true };

        const finalMessage = await stream.finalMessage();
        const latencyMs = performance.now() - start;
        const usage = {
          inputTokens: finalMessage.usage?.input_tokens ?? 0,
          outputTokens: finalMessage.usage?.output_tokens ?? 0,
        };
        const modelPricing = getPricing(model);
        const cost = estimateCost(usage, modelPricing);

        resolveResponse!({
          text: fullText,
          model,
          provider: "anthropic",
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
registerProvider("anthropic", createAnthropicProvider);
