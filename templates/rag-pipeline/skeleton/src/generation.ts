/**
 * Answer generation with retrieved context.
 *
 * Constructs a prompt from retrieved document chunks and the user's query,
 * sends it to an LLM via the provider registry, and returns a response
 * with source citations.
 */

import type { Config } from "./config.js";
import type { RetrievalResult } from "./retrieval.js";
import { createRetriever } from "./retrieval.js";
import { getLlmProvider } from "./providers/index.js";
import { logger } from "./logger.js";

const SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context.

Rules:
- Answer ONLY based on the provided context. If the context doesn't contain enough information, say so.
- Cite your sources by referencing the source document at the end of relevant statements.
- Be concise and direct.
- If multiple sources agree, synthesize them into a single coherent answer.`;

function formatContext(results: RetrievalResult[]): string {
  if (!results.length) return "(No relevant documents found.)";

  return results
    .map(
      (r) =>
        `--- Source: ${r.source} (relevance: ${r.score.toFixed(2)}) ---\n${r.content}\n`,
    )
    .join("\n");
}

function buildUserMessage(query: string, context: string): string {
  return (
    `Context:\n${context}\n\n` +
    `Question: ${query}\n\n` +
    `Answer the question based on the context above. Cite sources where relevant.`
  );
}

export interface SourceCitation {
  source: string;
  score: number;
  contentPreview: string;
}

export interface GenerationResult {
  answer: string;
  sources: SourceCitation[];
  model: string;
  usage: Record<string, number>;
}

/**
 * Generate an answer from retrieved context.
 */
export async function generate(
  query: string,
  results: RetrievalResult[],
  config: Config,
): Promise<GenerationResult> {
  const context = formatContext(results);
  const providerName = config.generation.provider;

  const apiKey = config.generation.anthropicApiKey || config.generation.openaiApiKey;
  const provider = getLlmProvider(providerName, apiKey);
  const userMessage = buildUserMessage(query, context);

  const { answer, usage } = await provider.generate(
    SYSTEM_PROMPT,
    userMessage,
    config.generation.model,
    config.generation.temperature,
    config.generation.maxTokens,
  );

  const sources: SourceCitation[] = results.map((r) => ({
    source: r.source,
    score: r.score,
    contentPreview: r.content.length > 200 ? r.content.slice(0, 200) + "..." : r.content,
  }));

  logger.info("Generation complete", {
    provider: providerName,
    model: config.generation.model,
    sources: sources.length,
    totalTokens: usage.total_tokens ?? 0,
  });

  return {
    answer,
    sources,
    model: config.generation.model,
    usage,
  };
}

/**
 * End-to-end RAG query: retrieve context and generate an answer.
 *
 * This is the main entry point for querying the pipeline. It:
 *
 * 1. Creates a retriever from settings
 * 2. Retrieves relevant document chunks
 * 3. Generates an answer with source citations
 */
export async function query(question: string, config: Config): Promise<GenerationResult> {
  const retriever = await createRetriever(config);
  const results = await retriever.retrieve(question);
  return generate(question, results, config);
}
