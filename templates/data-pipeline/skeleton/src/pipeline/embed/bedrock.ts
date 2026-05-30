/**
 * AWS Bedrock embedding provider (Titan Text v2) — the org default.
 *
 * Auth is the AWS credential chain (IRSA on-cluster), never API keys. Every call
 * carries an AbortSignal timeout so a hung Bedrock socket trips the circuit
 * breaker, and the Titan response is schema-validated before use rather than
 * trusting raw model output.
 *
 * Registers itself as the "bedrock" embedding provider on import.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import type { EmbeddingProvider } from "./types.js";
import { registerEmbeddingProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

const REQUEST_TIMEOUT_MS = Number(process.env.EMBED_REQUEST_TIMEOUT_MS ?? 30_000);
const titanResponseSchema = z.object({ embedding: z.array(z.number()) });

class BedrockEmbedder implements EmbeddingProvider {
  readonly name = "bedrock";

  private readonly client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION ?? "us-west-2",
  });
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

  async embed(text: string): Promise<number[]> {
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

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Titan embeds a single input per call; sequential keeps it within quota.
    const out: number[][] = [];
    for (const t of texts) {
      out.push(await this.embed(t));
    }
    return out;
  }
}

registerEmbeddingProvider(
  "bedrock",
  (model?: unknown, dims?: unknown) =>
    new BedrockEmbedder(model as string, dims as number),
);
