/**
 * OpenAI GPT-4o vision provider.
 *
 * Supports image analysis via GPT-4o's vision capabilities and text
 * analysis for transcribed audio. Registers itself as the "openai"
 * provider on import.
 */

import OpenAI from "openai";
import type { MultimodalLlmProvider, AnalysisResult } from "./types.js";
import type { ProcessedInput } from "../processors/types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

class OpenAIVisionProvider implements MultimodalLlmProvider {
  private readonly client: OpenAI;
  private readonly cb = createCircuitBreaker();

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required when using the OpenAI provider",
      );
    }
    this.client = new OpenAI({ apiKey: key });
  }

  async analyze(
    input: ProcessedInput,
    systemPrompt: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<AnalysisResult> {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    if (input.base64 && input.modality === "image") {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${input.mimeType};base64,${input.base64}`,
          detail: (input.metadata.detail as "high" | "low" | "auto") ?? "high",
        },
      });
      content.push({
        type: "text",
        text: "Analyze this image and provide a detailed structured description.",
      });
    } else if (input.text) {
      content.push({
        type: "text",
        text: `Analyze the following transcribed content:\n\n${input.text}`,
      });
    }

    const response = await this.cb.execute(() =>
      this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    );

    const text = response.choices[0]?.message?.content ?? "";

    const usage: Record<string, number> = {};
    if (response.usage) {
      usage.prompt_tokens = response.usage.prompt_tokens;
      usage.completion_tokens = response.usage.completion_tokens;
      usage.total_tokens = response.usage.total_tokens;
    }

    return {
      content: text,
      model: response.model,
      usage,
    };
  }

  async analyzeFrames(
    frames: string[],
    systemPrompt: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<AnalysisResult> {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    for (let i = 0; i < frames.length; i++) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${frames[i]}`,
          detail: "high",
        },
      });
      content.push({
        type: "text",
        text: `Frame ${i + 1} of ${frames.length}`,
      });
    }

    content.push({
      type: "text",
      text: "Analyze these video frames in sequence and provide a structured description of the video content.",
    });

    const response = await this.cb.execute(() =>
      this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    );

    const text = response.choices[0]?.message?.content ?? "";

    const usage: Record<string, number> = {};
    if (response.usage) {
      usage.prompt_tokens = response.usage.prompt_tokens;
      usage.completion_tokens = response.usage.completion_tokens;
      usage.total_tokens = response.usage.total_tokens;
    }

    return {
      content: text,
      model: response.model,
      usage,
    };
  }
}

registerProvider("openai", (apiKey?: unknown) => new OpenAIVisionProvider(apiKey as string));
