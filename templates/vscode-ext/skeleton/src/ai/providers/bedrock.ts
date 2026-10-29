import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { registerProvider } from "./registry";
import type { AiProvider, ChatMessage, ProviderSettings } from "./types";

// ── Bedrock Provider ────────────────────────────────────────────────
//
// Bedrock's Converse API, called from the extension host under the
// credentials the AWS SDK's chain resolves for the profile the `awsProfile`
// setting names, or the SDK's default chain when it names none. The
// provider signs with whatever the chain resolves and checks nothing about
// it, so the profile decides what a call runs under. Configure it as an IAM
// Identity Center sign-in or an assumed role (`role_arn`), which hand the
// SDK temporary credentials for the role; a profile holding an access key
// of its own signs every call with that long-lived key. The extension
// stores no credential and no provider key: its settings name a profile
// and a region, never a key.
//
// A call names the model the `model` setting gives, then DEFAULT_BEDROCK_MODEL,
// as a cross-region inference-profile ID: a Claude model that serves only
// through inference profiles refuses its bare foundation-model ID. The
// `awsRegion` setting is the region the profile is invoked in, then
// AWS_REGION, then DEFAULT_AWS_REGION. One client serves each profile and
// region pair, so a settings change takes effect on the next turn. A call
// fails when its reply takes longer than DEFAULT_REQUEST_TIMEOUT_MS
// (`requestTimeoutMs` sets it per instance); the request's abort signal
// fires then, which cancels the request.
//

/** The model a call names when the `model` setting names none. */
export const DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-sonnet-5";

/** The region Bedrock is called in when neither `awsRegion` nor AWS_REGION names one. */
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

/** Where a client signs and calls: the AWS profile, or the default chain when unset, and the region. */
export interface ClientTarget {
  profile?: string;
  region: string;
}

export interface BedrockProviderOptions {
  /** Builds the client for a profile and region. A BedrockRuntimeClient when unset. */
  createClient?: (target: ClientTarget) => ConverseClient;
  /** How long a call waits on its reply, in milliseconds. DEFAULT_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
}

/** The text blocks of a Converse reply, joined. */
export function converseText(output: ConverseCommandOutput): string {
  return (output.output?.message?.content ?? []).map((block) => block.text ?? "").join("");
}

/** A Bedrock provider. It builds a client at the first call for each profile and region. */
export function createBedrockProvider(options: BedrockProviderOptions = {}): AiProvider {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const createClient =
    options.createClient ??
    ((target: ClientTarget) =>
      new BedrockRuntimeClient({ region: target.region, profile: target.profile }));
  const clients = new Map<string, ConverseClient>();

  function clientFor(settings: ProviderSettings): ConverseClient {
    const target: ClientTarget = {
      profile: settings.awsProfile || undefined,
      region: settings.awsRegion || process.env.AWS_REGION || DEFAULT_AWS_REGION,
    };
    const key = `${target.profile ?? ""}\n${target.region}`;
    let client = clients.get(key);
    if (!client) {
      client = createClient(target);
      clients.set(key, client);
    }
    return client;
  }

  return {
    defaultModel: DEFAULT_BEDROCK_MODEL,

    async sendMessage(messages: ChatMessage[], settings: ProviderSettings): Promise<string> {
      const output = await clientFor(settings).send(
        new ConverseCommand({
          modelId: settings.model || DEFAULT_BEDROCK_MODEL,
          messages: messages.map((m) => ({ role: m.role, content: [{ text: m.content }] })),
          inferenceConfig: { maxTokens: MAX_TOKENS },
        }),
        { abortSignal: AbortSignal.timeout(requestTimeoutMs) },
      );
      return converseText(output);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup, so
// its clients outlive a single turn.
const bedrockProvider = createBedrockProvider();
registerProvider("bedrock", () => bedrockProvider);
