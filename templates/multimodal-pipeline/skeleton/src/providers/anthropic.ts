/**
 * Anthropic Claude vision provider.
 *
 * Supports image analysis via Claude's vision capabilities and text
 * analysis for transcribed audio. Registers itself as the "anthropic"
 * provider on import.
 *
 * The Messages API rejects `temperature`, `top_p` and `top_k` at any value,
 * so the configured `temperature` is not sent. An instance logs the first
 * request that carries one, once, at debug level.
 */

import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { logger } from "../logger.js";
import type { ProcessedInput } from "../processors/types.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { registerProvider } from "./registry.js";
import type { AnalysisResult, MultimodalLlmProvider } from "./types.js";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/**
 * The Anthropic vision provider. `clientOptions` is SDK client configuration
 * (base URL, timeout, the `fetch` requests go through), applied under the
 * API key this provider sets.
 */
export class AnthropicVisionProvider implements MultimodalLlmProvider {
  private readonly client: Anthropic;
  private readonly cb = createCircuitBreaker();
  private droppedTemperatureLogged = false;

  constructor(apiKey?: string, clientOptions: ClientOptions = {}) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required when using the Anthropic provider",
      );
    }
    this.client = new Anthropic({ ...clientOptions, apiKey: key });
  }

  private noteDroppedTemperature(temperature: number): void {
    if (this.droppedTemperatureLogged) return;
    this.droppedTemperatureLogged = true;
    logger.debug("anthropic sends no temperature", { temperature });
  }

  async analyze(
    input: ProcessedInput,
    systemPrompt: string,
    model: string,
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<AnalysisResult> {
    if (temperature !== undefined) this.noteDroppedTemperature(temperature);
    const content: Anthropic.ContentBlockParam[] = [];

    if (input.base64 && input.modality === "image") {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: input.mimeType as ImageMediaType,
          data: input.base64,
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
      this.client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    );

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";

    return {
      content: text,
      model: response.model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async analyzeFrames(
    frames: string[],
    systemPrompt: string,
    model: string,
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<AnalysisResult> {
    if (temperature !== undefined) this.noteDroppedTemperature(temperature);
    const content: Anthropic.ContentBlockParam[] = [];

    for (let i = 0; i < frames.length; i++) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: frames[i],
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
      this.client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    );

    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";

    return {
      content: text,
      model: response.model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}

registerProvider("anthropic", (apiKey?: unknown) => new AnthropicVisionProvider(apiKey as string));
