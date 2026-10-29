import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { readRequestTimeoutMs } from "../config.js";
import { llmDuration, llmErrorsTotal, llmRequestsTotal, recordLlmTokens } from "../metrics.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerProvider } from "./registry.js";
import type { ChatMessage, LlmProvider } from "./types.js";

// Bedrock via the Converse API, called directly. Auth is the AWS credential
// chain, never API keys, so it serves the bot off the nanohype substrate: an
// ECS task role, or a local AWS profile. On the substrate the gateway provider
// is the path to a model: a direct call skips the route's guardrail and rate
// limit. A cachePoint after the system prompt amortizes the (large, stable)
// prefix across turns — the mandated prompt-caching pattern;
// cache_read/cache_write tokens are metered so the hit ratio is observable.
//
// LLM_MODEL names the model as a cross-region inference-profile ID, and
// DEFAULT_BEDROCK_MODEL when unset: a Claude model that serves only through
// inference profiles refuses its bare foundation-model ID. AWS_REGION is the
// region the profile is invoked in. Every call runs through the provider's
// circuit breaker and fails when its reply takes longer than
// LLM_REQUEST_TIMEOUT_MS (30s by default); the request's abort signal fires
// then, which cancels the request, so a hung Bedrock socket trips the
// breaker instead of hanging forever.

/** The per-call request timeout LLM_REQUEST_TIMEOUT_MS sets, in milliseconds. */
const REQUEST_TIMEOUT_MS = readRequestTimeoutMs();

/** The model a call names when LLM_MODEL is unset or empty. */
export const DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-sonnet-5";

/** The region Bedrock is called in when AWS_REGION is unset or empty. */
export const DEFAULT_AWS_REGION = "us-east-1";

/** The reply length every call asks for. */
const MAX_TOKENS = 2048;

/** The part of a BedrockRuntimeClient the provider calls. */
export interface ConverseClient {
  send(
    command: ConverseCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<ConverseCommandOutput>;
}

export interface BedrockProviderOptions {
  /** The client calls go through. A BedrockRuntimeClient on the default credential chain when unset. */
  client?: ConverseClient;
  /** The inference-profile ID a call names. LLM_MODEL, then DEFAULT_BEDROCK_MODEL, when unset. */
  model?: string;
  /** How long a call waits on its reply, in milliseconds. LLM_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
}

/**
 * A Bedrock provider with its own circuit breaker. Its client is built at
 * the first call, so registering it builds none.
 */
export function createBedrockProvider(options: BedrockProviderOptions = {}): LlmProvider {
  const model = options.model || process.env.LLM_MODEL || DEFAULT_BEDROCK_MODEL;
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const cb = createCircuitBreaker();
  let client = options.client;

  function bedrockClient(): ConverseClient {
    client ??= new BedrockRuntimeClient({
      region: process.env.AWS_REGION || DEFAULT_AWS_REGION,
    });
    return client;
  }

  return {
    async chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
      const start = performance.now();
      const labels = { provider: "bedrock", model };
      llmRequestsTotal.add(1, labels);
      try {
        const response = await cb.execute(() =>
          bedrockClient().send(
            new ConverseCommand({
              modelId: model,
              system: [{ text: systemPrompt }, { cachePoint: { type: "default" } }],
              messages: messages.map((m) => ({
                role: m.role,
                content: [{ text: m.content }],
              })),
              inferenceConfig: { maxTokens: MAX_TOKENS },
            }),
            { abortSignal: AbortSignal.timeout(requestTimeoutMs) },
          ),
        );

        const usage = response.usage;
        if (usage) {
          recordLlmTokens({
            ...labels,
            input: usage.inputTokens ?? 0,
            output: usage.outputTokens ?? 0,
            cacheRead: usage.cacheReadInputTokens ?? 0,
            cacheWrite: usage.cacheWriteInputTokens ?? 0,
          });
        }

        const blocks = response.output?.message?.content ?? [];
        return blocks
          .map((b) => b.text ?? "")
          .join("\n")
          .trim();
      } catch (err) {
        llmErrorsTotal.add(1, labels);
        throw err;
      } finally {
        // performance.now() is milliseconds; the histogram is in seconds.
        llmDuration.record((performance.now() - start) / 1000, labels);
      }
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker holds across requests.
const bedrockProvider = createBedrockProvider();
registerProvider("bedrock", () => bedrockProvider);
