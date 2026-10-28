import type { Message, SystemContentBlock } from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
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
  TokenUsage,
} from "../types.js";
import { estimateCost, getPricing } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── AWS Bedrock Provider ───────────────────────────────────────────
//
// Bedrock via the Converse API — the org-default LLM path. Auth is the
// AWS credential chain (IRSA on the cluster), never API keys. A
// cachePoint after the (stable) system prompt amortizes the large prefix
// across turns — the mandated prompt-caching pattern; cache_read /
// cache_write tokens flow through to TokenUsage so the hit ratio is
// observable. Every call carries an explicit request timeout, so a hung
// Bedrock socket trips the circuit breaker instead of hanging forever.
// Converse normalizes the model-family quirks (Claude vs. Llama) into one
// request/response shape, so there is no hand-rolled body marshalling.
//
// No Claude model receives `temperature`, `top_p` or `top_k`, whether
// through this provider or through the Anthropic one. Bedrock documents
// them per Claude model: unsupported outright, held to their defaults,
// limited to one of `temperature` and `top_p`, or incompatible with
// thinking, which some models run by default. Rules that differ per
// model cannot be met from provider-neutral options, so a Claude model
// id gets none of them in either request mode. Other model families get
// the caller's values.
//

const DEFAULT_MODEL = "us.anthropic.claude-sonnet-5";
const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30_000);

// A Claude model id on Bedrock: the foundation model (`anthropic.…`), an
// inference profile (`us.anthropic.…`, `global.anthropic.…`), or an ARN
// ending in either.
const CLAUDE_MODEL_ID = /(?:^|[./])anthropic\./;

// Never trust raw model output — validate the Converse usage block before
// reading token counts. Fields are optional because not every model family
// reports cache or total counts.
const converseUsageSchema = z
  .object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    totalTokens: z.number().optional(),
    cacheReadInputTokens: z.number().optional(),
    cacheWriteInputTokens: z.number().optional(),
  })
  .partial();

function usageFrom(raw: unknown): TokenUsage {
  const u = converseUsageSchema.parse(raw ?? {});
  return {
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    cacheReadTokens: u.cacheReadInputTokens ?? 0,
    cacheWriteTokens: u.cacheWriteInputTokens ?? 0,
  };
}

/** Split messages into the Converse system blocks and conversation turns. */
function buildConverse(messages: ChatMessage[]): {
  system: SystemContentBlock[];
  turns: Message[];
} {
  const systemPrompt = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  // cachePoint after the (stable) system prompt — the mandated caching
  // pattern. Omit the block entirely when there is no system prompt.
  const system: SystemContentBlock[] = systemPrompt
    ? [{ text: systemPrompt }, { cachePoint: { type: "default" } }]
    : [];

  const turns: Message[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ text: m.content }],
    }));

  return { system, turns };
}

function createBedrockProvider(): LlmProvider {
  let client: BedrockRuntimeClient | null = null;
  const cb = createCircuitBreaker();

  function getClient(): BedrockRuntimeClient {
    if (!client) {
      client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION ?? "us-east-1",
      });
    }
    return client;
  }

  const pricing: Pricing = getPricing("claude-sonnet-5");

  // The caller's sampling options, as Converse names them, for a request
  // to `model`: none for a Claude model id. The first request that drops
  // one says so at debug level.
  let droppedSamplingLogged = false;
  function samplingFor(model: string, opts?: ChatOptions): { temperature?: number; topP?: number } {
    const requested = {
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts?.topP !== undefined ? { topP: opts.topP } : {}),
    };
    if (!CLAUDE_MODEL_ID.test(model)) return requested;
    if (Object.keys(requested).length > 0 && !droppedSamplingLogged) {
      droppedSamplingLogged = true;
      logger.debug("bedrock sends no sampling options to a Claude model", { model, ...requested });
    }
    return {};
  }

  return {
    name: "bedrock",
    pricing,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const sampling = samplingFor(model, opts);

      const { system, turns } = buildConverse(messages);
      const start = performance.now();

      const response = await cb.execute(() =>
        getClient().send(
          new ConverseCommand({
            modelId: model,
            system,
            messages: turns,
            inferenceConfig: {
              maxTokens,
              ...sampling,
              ...(opts?.stop ? { stopSequences: opts.stop } : {}),
            },
          }),
          // Per-request timeout — a hung Bedrock socket trips the breaker
          // instead of hanging forever.
          { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
        ),
      );

      const latencyMs = performance.now() - start;
      const usage = usageFrom(response.usage);
      const blocks = response.output?.message?.content ?? [];
      const text = blocks
        .map((b) => b.text ?? "")
        .join("")
        .trim();

      const modelPricing = getPricing(model.replace(/:.*$/, "").replace(/^.*\./, ""));
      const cost = estimateCost(usage, modelPricing);

      logger.debug("bedrock chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "bedrock", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const sampling = samplingFor(model, opts);

      let resolveResponse: (value: LlmResponse) => void;
      const responsePromise = new Promise<LlmResponse>((resolve) => {
        resolveResponse = resolve;
      });

      async function* generate(): AsyncGenerator<StreamChunk> {
        const start = performance.now();
        let fullText = "";
        let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

        const { system, turns } = buildConverse(messages);

        const response = await getClient().send(
          new ConverseStreamCommand({
            modelId: model,
            system,
            messages: turns,
            inferenceConfig: {
              maxTokens,
              ...sampling,
              ...(opts?.stop ? { stopSequences: opts.stop } : {}),
            },
          }),
          { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
        );

        if (response.stream) {
          // Converse streams typed SDK events — text deltas and a metadata
          // event carrying usage — so there is no raw model JSON to parse.
          for await (const event of response.stream) {
            const delta = event.contentBlockDelta?.delta?.text;
            if (delta) {
              fullText += delta;
              yield { text: delta, done: false };
            }
            if (event.metadata?.usage) {
              usage = usageFrom(event.metadata.usage);
            }
          }
        }

        yield { text: "", done: true };

        const latencyMs = performance.now() - start;
        // Some model families omit usage from the stream metadata; fall back
        // to a local estimate so cost is never silently zero.
        if (usage.inputTokens === 0 && usage.outputTokens === 0) {
          usage = {
            inputTokens: countTokens(messages.map((m) => m.content).join(" ")),
            outputTokens: countTokens(fullText),
          };
        }
        const modelPricing = getPricing(model.replace(/:.*$/, "").replace(/^.*\./, ""));
        const cost = estimateCost(usage, modelPricing);

        resolveResponse!({
          text: fullText,
          model,
          provider: "bedrock",
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
registerProvider("bedrock", createBedrockProvider);
