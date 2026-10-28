import {
  BedrockRuntimeClient,
  type BedrockRuntimeClientConfig,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { countTokens } from "../tokens/counter.js";
import type { ChatMessage, ChatOptions, GatewayResponse } from "../types.js";
import { readBedrockCacheTokens } from "./bedrock-cache.js";
import { createCircuitBreaker } from "./circuit-breaker.js";
import { registerProvider } from "./registry.js";
import { REQUEST_TIMEOUT_MS } from "./request-timeout.js";
import type { GatewayProvider, ProviderPricing } from "./types.js";

// ── Bedrock Provider ────────────────────────────────────────────────
//
// The org-default LLM path: Claude Sonnet via the Bedrock Converse API.
// Auth is the AWS credential chain (IRSA on the cluster), never API keys.
// A cachePoint after the (stable) system prompt amortizes the prefix
// across turns — the mandated prompt-caching pattern; cache_read/write
// tokens are reported in usage so the hit ratio is observable. Every call
// carries an explicit request timeout (LLM_REQUEST_TIMEOUT_MS) so a hung
// Bedrock socket trips the circuit breaker instead of hanging forever.
//
// Sampling parameters. Bedrock documents `temperature`, `top_p` and
// `top_k` per Claude model: Claude Opus 4.7 and later do not support
// them, Claude Sonnet 4.5 and Claude Haiku 4.5 take `temperature` or
// `top_p` but not both, and thinking, which Claude Sonnet 5 runs by
// default as adaptive thinking, is incompatible with modifying any of
// them. Rules that differ per model cannot be met from provider-neutral
// options, so a Claude-compatible model id gets none of them and any
// other model id gets the caller's `temperature`.
//
// A model id names its family through its provider segment: the first
// segment of a foundation model id (`anthropic.claude-…`), the second of
// a system inference profile id (`us.anthropic.claude-…`), bare or as the
// resource of a `foundation-model/` or `inference-profile/` ARN. It is
// Claude when that segment is `anthropic`. Every other model id names no
// family and counts as Claude-compatible: an ARN of any other resource
// type (`application-inference-profile`, `provisioned-model`,
// `imported-model`, `custom-model`, `custom-model-deployment`, a prompt or
// prompt router) and an id with no provider segment.
//
// That is the `auto` rule, and `samplingParameters` (for the registered
// provider, BEDROCK_SAMPLING_PARAMETERS) can replace it: `send` sends the
// caller's `temperature` to every model id, which is how an id that names
// no family receives it when it serves another family, and `omit` sends it
// to none.
//
// A dropped `temperature` is not logged: the gateway carries no logger.
//

const DEFAULT_MODEL = process.env.LLM_MODEL ?? "us.anthropic.claude-sonnet-5";

const SAMPLING_PARAMETERS = ["auto", "send", "omit"] as const;

/**
 * Which requests carry the caller's sampling options: `auto` sends them to a
 * model id that names a family other than Claude and to no other, `send`
 * sends them to every model id, and `omit` sends them to none.
 */
export type SamplingParameters = (typeof SAMPLING_PARAMETERS)[number];

function isSamplingParameters(value: string): value is SamplingParameters {
  return SAMPLING_PARAMETERS.some((mode) => mode === value);
}

/** Reads a SamplingParameters setting, `auto` when unset or empty. */
export function parseSamplingParameters(value: string | undefined): SamplingParameters {
  if (value === undefined || value === "") return "auto";
  if (!isSamplingParameters(value)) {
    throw new Error(
      `BEDROCK_SAMPLING_PARAMETERS must be one of ${SAMPLING_PARAMETERS.join(", ")}, got "${value}"`,
    );
  }
  return value;
}

// An ARN whose resource is a model id: a foundation model or a system
// inference profile.
const MODEL_ID_ARN = /^arn:[^:]+:bedrock:[^:]*:[^:]*:(?:foundation-model|inference-profile)\/(.+)$/;
// A model id with a provider segment.
const PROVIDER_SEGMENT = /^[a-z0-9-]+\./;
// A model id whose provider segment is `anthropic`.
const CLAUDE_MODEL_ID = /^(?:[a-z-]+\.)?anthropic\./;

/** Whether Bedrock's Claude rules govern `modelId`: Claude, or no family named. */
function claudeCompatible(modelId: string): boolean {
  const id = modelId.startsWith("arn:") ? MODEL_ID_ARN.exec(modelId)?.[1] : modelId;
  if (id === undefined || !PROVIDER_SEGMENT.test(id)) return true;
  return CLAUDE_MODEL_ID.test(id);
}

export interface BedrockProviderOptions {
  /** Which requests carry the caller's `temperature`. Default: `auto`. */
  samplingParameters?: SamplingParameters;
  /**
   * SDK client configuration, applied over the region AWS_REGION names:
   * credentials, an endpoint, or the `requestHandler` requests go through.
   */
  client?: BedrockRuntimeClientConfig;
}

/**
 * A Bedrock provider with its own SDK client and circuit breaker. The
 * registered `bedrock` provider is one of these, with `samplingParameters`
 * read from BEDROCK_SAMPLING_PARAMETERS.
 */
export function createBedrockProvider(options: BedrockProviderOptions = {}): GatewayProvider {
  const samplingParameters = options.samplingParameters ?? "auto";

  let client: BedrockRuntimeClient | null = null;
  function getClient(): BedrockRuntimeClient {
    if (!client) {
      client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION ?? "us-east-1",
        ...options.client,
      });
    }
    return client;
  }

  const cb = createCircuitBreaker();

  /** The sampling options a Converse request for `opts` carries. */
  function samplingFor(opts: ChatOptions): Pick<ChatOptions, "temperature"> {
    if (opts.temperature === undefined) return {};
    const sends =
      samplingParameters === "auto"
        ? !claudeCompatible(opts.model ?? DEFAULT_MODEL)
        : samplingParameters === "send";
    return sends ? { temperature: opts.temperature } : {};
  }

  return {
    name: "bedrock",

    // Claude Sonnet on Bedrock — same per-1M-token rates as the Anthropic API.
    pricing: {
      input: 3,
      output: 15,
    } satisfies ProviderPricing,

    sampling: samplingFor,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<GatewayResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const sampling = samplingFor(opts ?? {});

      // Separate system messages from the conversation — Bedrock takes the
      // system prompt as its own field, with the cachePoint right after it.
      const systemParts = messages.filter((m) => m.role === "system");
      const conversationParts = messages.filter((m) => m.role !== "system");
      const systemPrompt = systemParts.map((m) => m.content).join("\n\n");

      const start = performance.now();

      const response = await cb.execute(() =>
        getClient().send(
          new ConverseCommand({
            modelId: model,
            system: systemPrompt
              ? [{ text: systemPrompt }, { cachePoint: { type: "default" } }]
              : undefined,
            messages: conversationParts.map((m) => ({
              role: m.role as "user" | "assistant",
              content: [{ text: m.content }],
            })),
            inferenceConfig: { maxTokens, ...sampling },
          }),
          // Per-request timeout — a hung Bedrock socket trips the breaker
          // instead of hanging forever.
          { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
        ),
      );

      const latencyMs = performance.now() - start;
      const usage = response.usage;
      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      // Prompt-cache tokens (Converse reports these; the gateway emits
      // bedrock_cache_total from them — see bedrock-cache.ts).
      const { cacheReadTokens, cacheWriteTokens } = readBedrockCacheTokens(usage);

      const blocks = response.output?.message?.content ?? [];
      const text = blocks
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();

      // Cache-aware cost: inputTokens is the non-cached input; reads bill at ~10%
      // of the input rate, writes at ~125% (AWS Bedrock prompt-cache pricing).
      const cost =
        ((inputTokens + cacheReadTokens * 0.1 + cacheWriteTokens * 1.25) * this.pricing.input) /
          1_000_000 +
        (outputTokens * this.pricing.output) / 1_000_000;

      return {
        text,
        model,
        provider: this.name,
        inputTokens,
        outputTokens,
        latencyMs,
        // `cached` is a gateway response-cache hit; a prompt-cache read is not one
        // (the response is freshly generated), so it stays false here.
        cached: false,
        cost,
        cacheReadTokens,
        cacheWriteTokens,
      };
    },

    countTokens(text: string): number {
      return countTokens(text);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup.
// It reads BEDROCK_SAMPLING_PARAMETERS as the module loads, so a value the
// setting does not know fails the import rather than the first request.
const bedrockProvider = createBedrockProvider({
  samplingParameters: parseSamplingParameters(process.env.BEDROCK_SAMPLING_PARAMETERS),
});
registerProvider("bedrock", () => bedrockProvider);
