import type { Message, SystemContentBlock } from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockRuntimeClient,
  type BedrockRuntimeClientConfig,
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { REQUEST_TIMEOUT_MS, withRequestTimeout } from "../resilience/request-timeout.js";
import { guardStream } from "../resilience/stream-guard.js";
import { countTokens } from "../tokens/counter.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  Pricing,
  StreamResponse,
  TokenUsage,
} from "../types.js";
import { estimateCost, getPricing } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── AWS Bedrock Provider ───────────────────────────────────────────
//
// Bedrock via the Converse API, called directly. Auth is the AWS
// credential chain, never API keys, so it serves an application off the
// nanohype substrate: an ECS task role, or a local AWS profile. On the
// substrate the operator's egress policy leaves application pods no
// route to Bedrock, and the gateway provider is the path there. A
// cachePoint after the (stable) system prompt amortizes the large prefix
// across turns — the mandated prompt-caching pattern; cache_read /
// cache_write tokens flow through to TokenUsage so the hit ratio is
// observable. Both request modes run through the circuit breaker under
// LLM_REQUEST_TIMEOUT_MS (120s by default; `requestTimeoutMs` sets it per
// instance): a request fails when its reply takes longer, and a stream
// when no event arrives for that long, so a hung Bedrock socket trips the
// breaker instead of holding the caller. resilience/request-timeout.ts
// gives the bound it puts on each mode. Converse normalizes the
// model-family quirks (Claude vs. Llama) into one request/response
// shape, so there is no hand-rolled body marshalling.
//
// createBedrockProvider() returns an instance with its own
// lazily-initialized SDK client and circuit breaker; the registered
// `bedrock` factory returns one such instance for the life of the process.
//
// Sampling parameters. Bedrock documents `temperature`, `top_p` and
// `top_k` per Claude model: Claude Opus 4.7 and later do not support
// them, Claude Sonnet 4.5 and Claude Haiku 4.5 take `temperature` or
// `top_p` but not both, and thinking, which Claude Sonnet 5 runs by
// default as adaptive thinking, is incompatible with modifying any of
// them. Rules that differ per model cannot be met from provider-neutral
// options, so in either request mode a Claude-compatible model id gets
// none of them and any other model id gets the caller's `temperature`
// and `topP`.
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
// caller's values to every model id, which is how an id that names no
// family receives them when it serves another family, and `omit` sends
// them to none. `send` is also how a caller's `temperature` reaches
// Claude Haiku 4.5 or Claude Sonnet 4.5, so a classification or routing
// call that wants temperature 0 from one of them runs under `send` and
// leaves `topP` unset: those models reject `temperature` and `top_p`
// together.
//
// An instance logs the first request whose caller-set values it drops,
// once, at debug level.
//

const DEFAULT_MODEL = "us.anthropic.claude-sonnet-5";

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

export interface BedrockProviderOptions {
  /** Which requests carry the caller's `temperature` and `topP`. Default: `auto`. */
  samplingParameters?: SamplingParameters;
  /**
   * How long a call waits on the model, in milliseconds: a whole request,
   * or each wait for a stream's next event. LLM_REQUEST_TIMEOUT_MS when unset.
   */
  requestTimeoutMs?: number;
  /**
   * SDK client configuration, applied over the region AWS_REGION names:
   * credentials, an endpoint, or the `requestHandler` requests go through.
   */
  client?: BedrockRuntimeClientConfig;
}

/**
 * A Bedrock provider instance with its own SDK client and circuit breaker.
 * The registered `bedrock` provider is one of these, with
 * `samplingParameters` read from BEDROCK_SAMPLING_PARAMETERS.
 */
export function createBedrockProvider(options: BedrockProviderOptions = {}): LlmProvider {
  const samplingParameters = options.samplingParameters ?? "auto";
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  let client: BedrockRuntimeClient | null = null;
  const cb = createCircuitBreaker();

  function getClient(): BedrockRuntimeClient {
    if (!client) {
      client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION ?? "us-east-1",
        ...options.client,
      });
    }
    return client;
  }

  const pricing: Pricing = getPricing("claude-sonnet-5");

  /**
   * The sampling options a Converse request for `opts` carries, as Converse
   * names them. Both request modes build `inferenceConfig` from this, and it
   * is the provider's `sampling` hook.
   */
  function samplingFor(opts?: ChatOptions): Pick<ChatOptions, "temperature" | "topP"> {
    const sends =
      samplingParameters === "auto"
        ? !claudeCompatible(opts?.model ?? DEFAULT_MODEL)
        : samplingParameters === "send";
    if (!sends) return {};
    return {
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts?.topP !== undefined ? { topP: opts.topP } : {}),
    };
  }

  let droppedSamplingLogged = false;
  function noteDroppedSampling(
    model: string,
    opts: ChatOptions | undefined,
    sent: Pick<ChatOptions, "temperature" | "topP">,
  ): void {
    if (droppedSamplingLogged) return;
    if (opts?.temperature === undefined && opts?.topP === undefined) return;
    if (Object.keys(sent).length > 0) return;
    droppedSamplingLogged = true;
    logger.debug("bedrock sends no sampling options to this model", {
      model,
      temperature: opts.temperature,
      topP: opts.topP,
    });
  }

  return {
    name: "bedrock",
    pricing,
    sampling: samplingFor,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const sampling = samplingFor(opts);
      noteDroppedSampling(model, opts, sampling);

      const { system, turns } = buildConverse(messages);
      const start = performance.now();

      const response = await cb.execute(() =>
        withRequestTimeout(requestTimeoutMs, (abortSignal) =>
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
            { abortSignal },
          ),
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
      const sampling = samplingFor(opts);
      noteDroppedSampling(model, opts, sampling);

      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      return guardStream(cb, requestTimeoutMs, {
        async open(abortSignal: AbortSignal) {
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
            { abortSignal },
          );
          return response.stream;
        },
        // Converse streams typed SDK events — text deltas and a metadata
        // event carrying usage — so there is no raw model JSON to parse.
        text(event) {
          if (event.metadata?.usage) usage = usageFrom(event.metadata.usage);
          return event.contentBlockDelta?.delta?.text;
        },
        finish(text, latencyMs) {
          // Some model families omit usage from the stream metadata; fall back
          // to a local estimate so cost is never silently zero.
          if (usage.inputTokens === 0 && usage.outputTokens === 0) {
            usage = {
              inputTokens: countTokens(messages.map((m) => m.content).join(" ")),
              outputTokens: countTokens(text),
            };
          }
          const modelPricing = getPricing(model.replace(/:.*$/, "").replace(/^.*\./, ""));
          const cost = estimateCost(usage, modelPricing);
          return { text, model, provider: "bedrock", usage, latencyMs, cost };
        },
      });
    },

    countTokens(text: string, model?: string): number {
      return countTokens(text, model);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker and log-once state hold across requests. It reads
// BEDROCK_SAMPLING_PARAMETERS as the module loads, so a value the setting
// does not know fails the import rather than the first request.
const bedrockProvider = createBedrockProvider({
  samplingParameters: parseSamplingParameters(process.env.BEDROCK_SAMPLING_PARAMETERS),
});
registerProvider("bedrock", () => bedrockProvider);
