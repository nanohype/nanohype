/**
 * OpenAI LLM and embedding provider.
 *
 * Registers itself as the "openai" LLM provider and the "openai"
 * embedding provider on import.
 */

import OpenAI from "openai";
import type { LlmProvider, EmbeddingProvider } from "./types.js";
import { registerLlmProvider, registerEmbeddingProvider } from "./registry.js";

class OpenAILlm implements LlmProvider {
  private readonly client: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required when using the OpenAI provider",
      );
    }
    this.client = new OpenAI({ apiKey: key });
  }

  async generate(
    systemPrompt: string,
    userMessage: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }> {
    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
    });

    const answer = response.choices[0]?.message?.content ?? "";

    const usage: Record<string, number> = {};
    if (response.usage) {
      usage.prompt_tokens = response.usage.prompt_tokens;
      usage.completion_tokens = response.usage.completion_tokens;
      usage.total_tokens = response.usage.total_tokens;
    }

    return { answer, usage };
  }
}

class OpenAIEmbedder implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly dims: number;
  private readonly batchSize: number;

  constructor(model = "text-embedding-3-small", dims = 1536, batchSize = 128, apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for OpenAI embeddings",
      );
    }
    this.client = new OpenAI({ apiKey: key });
    this.model = model;
    this.dims = dims;
    this.batchSize = batchSize;
  }

  get dimensions(): number {
    return this.dims;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      input: [text],
      model: this.model,
      dimensions: this.dims,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const response = await this.client.embeddings.create({
        input: batch,
        model: this.model,
        dimensions: this.dims,
      });
      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sorted.map((item) => item.embedding));
    }

    return allEmbeddings;
  }
}

registerLlmProvider("openai", (apiKey?: unknown) => new OpenAILlm(apiKey as string));
registerEmbeddingProvider(
  "openai",
  (model?: unknown, dims?: unknown, batchSize?: unknown, apiKey?: unknown) =>
    new OpenAIEmbedder(
      model as string,
      dims as number,
      batchSize as number,
      apiKey as string,
    ),
);
