import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerProvider } from "./registry.js";
import type { ChatMessage, LlmProvider } from "./types.js";

// ── Bedrock Provider ────────────────────────────────────────────────
//
// Bedrock's Converse API, called under the credentials the AWS SDK's
// default chain resolves. On a CI runner the eval workflow federates the
// job's GitHub OIDC token into the role the repository variable
// EVAL_ROLE_ARN names, and the chain reads that role's session
// credentials. On a workstation it reads the AWS profile the environment
// selects; the provider signs with whatever that profile resolves and
// checks nothing about it, so configure it as an IAM Identity Center
// sign-in or an assumed role (`role_arn`), never a profile holding an
// access key of its own. The project holds no provider key. Inside the
// cluster the gateway provider is the path to a model: a direct call skips
// the route's guardrail and rate limit.
//
// LLM_MODEL names the model as a cross-region inference-profile ID, and
// DEFAULT_BEDROCK_MODEL when unset: a Claude model that serves only through
// inference profiles refuses its bare foundation-model ID. AWS_REGION is the
// region the profile is invoked in. The system messages go out as Converse
// system blocks followed by a cache point, which amortizes a suite's shared
// prefix across its cases. Every call runs through the provider's circuit
// breaker and fails when its reply takes longer than
// DEFAULT_REQUEST_TIMEOUT_MS (`requestTimeoutMs` sets it per instance); the
// request's abort signal fires then, which cancels the request.
//

/** The model a run grades when LLM_MODEL is unset or empty. */
export const DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-sonnet-5";

/** The region Bedrock is called in when AWS_REGION is unset or empty. */
export const DEFAULT_AWS_REGION = "us-east-1";

/** How long a call waits on its reply when nothing sets a timeout, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

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
  /** How long a call waits on its reply, in milliseconds. DEFAULT_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
}

/** The text blocks of a Converse reply, joined. */
export function converseText(output: ConverseCommandOutput): string {
  return (output.output?.message?.content ?? []).map((block) => block.text ?? "").join("");
}

/**
 * A Bedrock provider with its own circuit breaker. Its client is built at
 * the first call, so registering it builds none.
 */
export function createBedrockProvider(options: BedrockProviderOptions = {}): LlmProvider {
  const model = options.model || process.env.LLM_MODEL || DEFAULT_BEDROCK_MODEL;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const cb = createCircuitBreaker();
  let client = options.client;

  function bedrockClient(): ConverseClient {
    client ??= new BedrockRuntimeClient({
      region: process.env.AWS_REGION || DEFAULT_AWS_REGION,
    });
    return client;
  }

  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      const bedrock = bedrockClient();
      const system = messages.filter((m) => m.role === "system").map((m) => ({ text: m.content }));
      const command = new ConverseCommand({
        modelId: model,
        ...(system.length > 0 ? { system: [...system, { cachePoint: { type: "default" } }] } : {}),
        messages: messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: [{ text: m.content }],
          })),
        inferenceConfig: { maxTokens: 4096 },
      });
      const output = await cb.execute(() =>
        bedrock.send(command, { abortSignal: AbortSignal.timeout(requestTimeoutMs) }),
      );
      return converseText(output);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker holds across requests.
const bedrockProvider = createBedrockProvider();
registerProvider("bedrock", () => bedrockProvider);
