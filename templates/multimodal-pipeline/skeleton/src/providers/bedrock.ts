import {
  BedrockRuntimeClient,
  type ContentBlock,
  ConverseCommand,
  type ConverseCommandOutput,
  type ImageFormat,
} from "@aws-sdk/client-bedrock-runtime";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { REQUEST_TIMEOUT_MS } from "../resilience/request-timeout.js";
import { registerProvider } from "./registry.js";
import type { AnalysisResult, MultimodalLlmProvider } from "./types.js";

// ── Bedrock Provider ────────────────────────────────────────────────
//
// Bedrock's Converse API, called directly under the IAM role the AWS SDK's
// default credential chain resolves: an ECS task role, a Lambda execution
// role, or on a workstation the AWS profile the environment selects, such
// as an IAM Identity Center sign-in. The chain hands the SDK temporary
// credentials, so the pipeline holds no long-lived credential and no
// provider key. It serves a pipeline that runs off the nanohype substrate;
// on the substrate the gateway provider is the path to a model, since a
// direct call skips the route's guardrail and rate limit.
//
// A call names LLM_MODEL as a cross-region inference-profile ID: a Claude
// model that serves only through inference profiles refuses its bare
// foundation-model ID. AWS_REGION is the region the profile is invoked in.
// Images and video frames go out as Converse image blocks in the user turn,
// and the system prompt as a system block followed by a cache point.
//
// Claude on Bedrock takes `temperature` on some models and refuses it on
// others, and thinking refuses any value, so a model id whose provider
// segment is `anthropic` gets none and every other model id gets the
// configured one. Every call runs through the provider's circuit breaker
// and fails when its reply takes longer than LLM_REQUEST_TIMEOUT_MS
// (`requestTimeoutMs` sets it per instance); the request's abort signal
// fires then, which cancels the request.
//

/** The region Bedrock is called in when AWS_REGION is unset or empty. */
export const DEFAULT_AWS_REGION = "us-east-1";

/** A model id whose provider segment is `anthropic`: a Claude model. */
const CLAUDE_MODEL_ID = /^(?:[a-z-]+\.)?anthropic\./;

/** The Converse image format for each image MIME type the pipeline sends. */
const IMAGE_FORMATS: Record<string, ImageFormat> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

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
  /** How long a call waits on its reply, in milliseconds. LLM_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
}

/** Whether `model` names a Claude model, which gets no `temperature`. */
export function isClaudeModel(model: string): boolean {
  return CLAUDE_MODEL_ID.test(model);
}

/** A Converse image block for base64 `data` of MIME type `mimeType`. */
function imageBlock(mimeType: string, data: string): ContentBlock {
  const format = IMAGE_FORMATS[mimeType];
  if (!format) {
    throw new Error(`Bedrock takes jpeg, png, gif or webp images, got ${mimeType}`);
  }
  return { image: { format, source: { bytes: Buffer.from(data, "base64") } } };
}

/** A Bedrock provider with its own circuit breaker. Its client is built at the first call. */
export function createBedrockProvider(options: BedrockProviderOptions = {}): MultimodalLlmProvider {
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const cb = createCircuitBreaker();
  let client = options.client;

  async function converse(
    content: ContentBlock[],
    systemPrompt: string,
    model: string,
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<AnalysisResult> {
    client ??= new BedrockRuntimeClient({ region: process.env.AWS_REGION || DEFAULT_AWS_REGION });
    const bedrock = client;
    const sendsTemperature = temperature !== undefined && !isClaudeModel(model);
    const command = new ConverseCommand({
      modelId: model,
      system: [{ text: systemPrompt }, { cachePoint: { type: "default" } }],
      messages: [{ role: "user", content }],
      inferenceConfig: { maxTokens, ...(sendsTemperature ? { temperature } : {}) },
    });
    const output = await cb.execute(() =>
      bedrock.send(command, { abortSignal: AbortSignal.timeout(requestTimeoutMs) }),
    );
    const input = output.usage?.inputTokens ?? 0;
    const produced = output.usage?.outputTokens ?? 0;
    return {
      content: (output.output?.message?.content ?? []).map((block) => block.text ?? "").join(""),
      model,
      usage: { input_tokens: input, output_tokens: produced, total_tokens: input + produced },
    };
  }

  return {
    async analyze(input, systemPrompt, model, temperature, maxTokens) {
      const content: ContentBlock[] = [];
      if (input.base64 && input.modality === "image") {
        content.push(imageBlock(input.mimeType, input.base64));
        content.push({ text: "Analyze this image and provide a detailed structured description." });
      } else if (input.text) {
        content.push({ text: `Analyze the following transcribed content:\n\n${input.text}` });
      }
      return converse(content, systemPrompt, model, temperature, maxTokens);
    },

    async analyzeFrames(frames, systemPrompt, model, temperature, maxTokens) {
      const content: ContentBlock[] = frames.flatMap((data, i) => [
        imageBlock("image/jpeg", data),
        { text: `Frame ${i + 1} of ${frames.length}` },
      ]);
      content.push({
        text: "Analyze these video frames in sequence and provide a structured description of the video content.",
      });
      return converse(content, systemPrompt, model, temperature, maxTokens);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its client and circuit breaker hold across requests.
const bedrockProvider = createBedrockProvider();
registerProvider("bedrock", () => bedrockProvider);
