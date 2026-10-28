/**
 * Shared interfaces for multimodal LLM providers.
 *
 * Each provider handles vision and/or audio input and returns
 * structured analysis results.
 */

import type { ProcessedInput } from "../processors/types.js";

export interface AnalysisResult {
  /** The raw text response from the LLM. */
  content: string;
  /** The model used for analysis. */
  model: string;
  /** Token usage statistics. */
  usage: Record<string, number>;
}

/**
 * A vision and text analysis provider. `temperature` is undefined when the
 * configuration sets none; config.ts states what each provider sends, set or
 * unset.
 */
export interface MultimodalLlmProvider {
  /** Analyze a processed multimodal input and return structured text. */
  analyze(
    input: ProcessedInput,
    systemPrompt: string,
    model: string,
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<AnalysisResult>;

  /** Analyze multiple frames (video) and return structured text. */
  analyzeFrames(
    frames: string[],
    systemPrompt: string,
    model: string,
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<AnalysisResult>;
}
