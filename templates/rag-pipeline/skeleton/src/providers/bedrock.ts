/**
 * AWS Bedrock providers — the org-default LLM (Converse + prompt caching) and
 * embedding (Titan Text v2) path. Auth is the AWS credential chain (IRSA
 * on-cluster), never API keys. Every call carries an AbortSignal timeout so a
 * hung Bedrock socket trips the circuit breaker instead of hanging, and the
 * Titan response is schema-validated before use (never trust raw model output).
 *
 * Registers itself as the "bedrock" LLM provider and the "bedrock" embedding
 * provider on import.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import type { LlmProvider, EmbeddingProvider } from "./types.js";
import { registerLlmProvider, registerEmbeddingProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30_000);

function newClient(): BedrockRuntimeClient {
  return new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-west-2" });
}

class BedrockLlm implements LlmProvider {
  private readonly client = newClient();
  private readonly cb = createCircuitBreaker();

  async generate(
    systemPrompt: string,
    userMessage: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }> {
    const response = await this.cb.execute(() =>
      this.client.send(
        new ConverseCommand({
          modelId: model,
          // cachePoint after the (stable) system prompt — the mandated
          // prompt-caching pattern; cache tokens are reported in usage.
          system: [{ text: systemPrompt }, { cachePoint: { type: "default" } }],
          messages: [{ role: "user", content: [{ text: userMessage }] }],
          inferenceConfig: { temperature, maxTokens },
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

class BedrockEmbedder implements EmbeddingProvider {
  private readonly client = newClient();
  private readonly cb = createCircuitBreaker();
  private readonly model: string;
  private readonly dims: number;

  constructor(model = "amazon.titan-embed-text-v2:0", dims = 1024) {
    this.model = model;
    this.dims = dims;
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
    const parsed = titanResponseSchema.parse(
      JSON.parse(new TextDecoder().decode(response.body)),
    );
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

registerLlmProvider("bedrock", () => new BedrockLlm());
registerEmbeddingProvider(
  "bedrock",
  (model?: unknown, dims?: unknown) =>
    new BedrockEmbedder(model as string, dims as number),
);
