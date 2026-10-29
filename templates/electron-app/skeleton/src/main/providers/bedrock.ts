import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { registerProvider } from "./registry.js";
import type { AiProvider, ChatMessage } from "./types.js";

// ── Bedrock Provider ────────────────────────────────────────────────
//
// Bedrock's Converse API, called from the main process under the
// credentials the AWS SDK's default credential chain resolves: on a
// workstation, the AWS profile the environment selects. The provider signs
// with whatever the chain resolves and checks nothing about it, so the
// profile decides what a call runs under. Configure it as an IAM Identity
// Center sign-in or an assumed role (`role_arn`), which hand the SDK
// temporary credentials for the role; a profile holding an access key of
// its own signs every call with that long-lived key. The app stores no
// credential and no provider key, and the sandboxed renderer reaches
// neither the chain nor the client.
//
// A call names the model the renderer asks for, then LLM_MODEL, then
// DEFAULT_BEDROCK_MODEL, as a cross-region inference-profile ID: a Claude
// model that serves only through inference profiles refuses its bare
// foundation-model ID. AWS_REGION is the region the profile is invoked in.
// A call fails when its reply takes longer than DEFAULT_REQUEST_TIMEOUT_MS
// (`requestTimeoutMs` sets it per instance); the request's abort signal
// fires then, which cancels the request.
//

/** The model a call names when neither the renderer nor LLM_MODEL names one. */
export const DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-sonnet-5";

/** The region Bedrock is called in when AWS_REGION is unset or empty. */
export const DEFAULT_AWS_REGION = "us-east-1";

/** How long a call waits on its reply when nothing sets a timeout, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/** The reply length every call asks for. */
const MAX_TOKENS = 4096;

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
  /** How long a call waits on its reply, in milliseconds. DEFAULT_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
}

/** The text blocks of a Converse reply, joined. */
export function converseText(output: ConverseCommandOutput): string {
  return (output.output?.message?.content ?? []).map((block) => block.text ?? "").join("");
}

/** A Bedrock provider. Its client is built at the first call, so registering it builds none. */
export function createBedrockProvider(options: BedrockProviderOptions = {}): AiProvider {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let client = options.client;

  return {
    get defaultModel() {
      return process.env.LLM_MODEL || DEFAULT_BEDROCK_MODEL;
    },

    async sendMessage(messages: ChatMessage[], model?: string): Promise<string> {
      client ??= new BedrockRuntimeClient({
        region: process.env.AWS_REGION || DEFAULT_AWS_REGION,
      });
      const output = await client.send(
        new ConverseCommand({
          modelId: model || this.defaultModel,
          messages: messages.map((m) => ({ role: m.role, content: [{ text: m.content }] })),
          inferenceConfig: { maxTokens: MAX_TOKENS },
        }),
        { abortSignal: AbortSignal.timeout(requestTimeoutMs) },
      );
      return converseText(output);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup.
const bedrockProvider = createBedrockProvider();
registerProvider("bedrock", () => bedrockProvider);
