/**
 * AWS Bedrock providers — the org-default LLM (Converse + prompt caching) and
 * embedding (Titan Text v2) path. Auth is the AWS credential chain (IRSA
 * on-cluster), never API keys. Every call carries an AbortSignal timeout so a
 * hung Bedrock socket trips the circuit breaker instead of hanging, and the
 * Titan response is schema-validated before use (never trust raw model output).
 *
 * Sampling parameters. Bedrock documents `temperature`, `top_p` and `top_k`
 * per Claude model: Claude Opus 4.7 and later do not support them, Claude
 * Sonnet 4.5 and Claude Haiku 4.5 take `temperature` or `top_p` but not both,
 * and thinking, which Claude Sonnet 5 runs by default as adaptive thinking, is
 * incompatible with modifying any of them. Rules that differ per model cannot
 * be met from one configured temperature, so the LLM sends none to a
 * Claude-compatible model id and the configured one to any other. A
 * configuration that sets no temperature sends none to any model.
 *
 * A model id names its family through its provider segment: the first segment
 * of a foundation model id (`anthropic.claude-…`), the second of a system
 * inference profile id (`us.anthropic.claude-…`), bare or as the resource of a
 * `foundation-model/` or `inference-profile/` ARN. It is Claude when that
 * segment is `anthropic`. Every other model id names no family and counts as
 * Claude-compatible: an ARN of any other resource type
 * (`application-inference-profile`, `provisioned-model`, `imported-model`,
 * `custom-model`, `custom-model-deployment`, a prompt or prompt router) and an
 * id with no provider segment. To send the temperature to such an id when it
 * serves another family, set BEDROCK_SAMPLING_PARAMETERS to `send`.
 *
 * An instance logs the first request whose temperature it drops, once, at
 * debug level.
 *
 * Registers itself as the "bedrock" LLM provider and the "bedrock" embedding
 * provider on import.
 */

import {
  BedrockRuntimeClient,
  type BedrockRuntimeClientConfig,
  ConverseCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerEmbeddingProvider, registerLlmProvider } from "./registry.js";
import type { EmbeddingProvider, LlmProvider } from "./types.js";

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30_000);

/**
 * Which requests carry the configured temperature: `auto` sends it to a model
 * id that names a family other than Claude and to no other, `send` sends it
 * to every model id, and `omit` sends it to none.
 */
export type SamplingParameters = "auto" | "send" | "omit";

const SAMPLING_PARAMETERS: readonly string[] = ["auto", "send", "omit"];

/** Reads a SamplingParameters setting, `auto` when unset or empty. */
export function parseSamplingParameters(value: string | undefined): SamplingParameters {
  if (value === undefined || value === "") return "auto";
  if (!SAMPLING_PARAMETERS.includes(value)) {
    throw new Error(
      `BEDROCK_SAMPLING_PARAMETERS must be one of ${SAMPLING_PARAMETERS.join(", ")}, got "${value}"`,
    );
  }
  return value as SamplingParameters;
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

export interface BedrockLlmOptions {
  /** Which requests carry the configured temperature. Default: `auto`. */
  samplingParameters?: SamplingParameters;
  /**
   * SDK client configuration, applied over the region AWS_REGION names:
   * credentials, an endpoint, or the `requestHandler` requests go through.
   */
  client?: BedrockRuntimeClientConfig;
}

function newClient(config: BedrockRuntimeClientConfig = {}): BedrockRuntimeClient {
  return new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1", ...config });
}

/** The Bedrock LLM. */
export class BedrockLlm implements LlmProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly samplingParameters: SamplingParameters;
  private readonly cb = createCircuitBreaker();
  private droppedTemperatureLogged = false;

  constructor(options: BedrockLlmOptions = {}) {
    this.client = newClient(options.client);
    this.samplingParameters = options.samplingParameters ?? "auto";
  }

  /** Whether a request to `model` carries the configured temperature. */
  private sendsTemperature(model: string): boolean {
    if (this.samplingParameters === "auto") return !claudeCompatible(model);
    return this.samplingParameters === "send";
  }

  private noteDroppedTemperature(model: string, temperature: number): void {
    if (this.droppedTemperatureLogged) return;
    this.droppedTemperatureLogged = true;
    logger.debug("bedrock sends no temperature to this model", { model, temperature });
  }

  async generate(
    systemPrompt: string,
    userMessage: string,
    model: string,
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }> {
    const sendTemperature = temperature !== undefined && this.sendsTemperature(model);
    if (temperature !== undefined && !sendTemperature) {
      this.noteDroppedTemperature(model, temperature);
    }
    const response = await this.cb.execute(() =>
      this.client.send(
        new ConverseCommand({
          modelId: model,
          // cachePoint after the (stable) system prompt — the mandated
          // prompt-caching pattern; cache tokens are reported in usage.
          system: [{ text: systemPrompt }, { cachePoint: { type: "default" } }],
          messages: [{ role: "user", content: [{ text: userMessage }] }],
          inferenceConfig: { maxTokens, ...(sendTemperature ? { temperature } : {}) },
        }),
        { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      ),
    );

    const blocks = response.output?.message?.content ?? [];
    const answer = blocks
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    const u = response.usage;
    const usage: Record<string, number> = {
      input_tokens: u?.inputTokens ?? 0,
      output_tokens: u?.outputTokens ?? 0,
      total_tokens: u?.totalTokens ?? 0,
      cache_read_tokens: u?.cacheReadInputTokens ?? 0,
      cache_write_tokens: u?.cacheWriteInputTokens ?? 0,
    };
    return { answer, usage };
  }
}

const titanResponseSchema = z.object({ embedding: z.array(z.number()) });

/**
 * The Titan embedder. `client` is SDK client configuration, applied over the
 * region AWS_REGION names.
 */
export class BedrockEmbedder implements EmbeddingProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly cb = createCircuitBreaker();
  private readonly model: string;
  private readonly dims: number;

  constructor(
    model = "amazon.titan-embed-text-v2:0",
    dims = 1024,
    client: BedrockRuntimeClientConfig = {},
  ) {
    this.model = model;
    this.dims = dims;
    this.client = newClient(client);
  }

  get dimensions(): number {
    return this.dims;
  }

  private async embedOne(text: string): Promise<number[]> {
    const response = await this.cb.execute(() =>
      this.client.send(
        new InvokeModelCommand({
          modelId: this.model,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({ inputText: text, dimensions: this.dims, normalize: true }),
        }),
        { abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      ),
    );
    const parsed = titanResponseSchema.parse(JSON.parse(new TextDecoder().decode(response.body)));
    return parsed.embedding;
  }

  async embed(text: string): Promise<number[]> {
    return this.embedOne(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Titan embeds a single input per call; sequential keeps it simple and
    // within per-account request quota.
    const out: number[][] = [];
    for (const t of texts) {
      out.push(await this.embedOne(t));
    }
    return out;
  }
}

/**
 * The Bedrock LLM the "bedrock" registry entry builds: `samplingParameters`
 * read from BEDROCK_SAMPLING_PARAMETERS, over `client`.
 */
export function bedrockLlmFromEnvironment(client?: BedrockRuntimeClientConfig): BedrockLlm {
  return new BedrockLlm({
    samplingParameters: parseSamplingParameters(process.env.BEDROCK_SAMPLING_PARAMETERS),
    client,
  });
}

registerLlmProvider("bedrock", () => bedrockLlmFromEnvironment());
registerEmbeddingProvider(
  "bedrock",
  (model?: unknown, dims?: unknown) => new BedrockEmbedder(model as string, dims as number),
);
