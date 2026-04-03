import { VertexAI } from "@google-cloud/vertexai";
import type { LlmProvider } from "./types.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  StreamResponse,
  StreamChunk,
  Pricing,
} from "../types.js";
import { getPricing, estimateCost } from "../types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { countTokens } from "../tokens/counter.js";
import { logger } from "../logger.js";

// ── Google Vertex AI Provider ──────────────────────────────────────
//
// Gemini models via @google-cloud/vertexai. Uses Google Application
// Default Credentials (ADC) for auth. Each factory call returns a
// new instance with its own client and circuit breaker.
//
// Auth: GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION env vars,
// plus ADC (gcloud auth application-default login).
//

const DEFAULT_MODEL = "gemini-2.0-flash";

function createVertexProvider(): LlmProvider {
  let vertexAI: VertexAI | null = null;
  const cb = createCircuitBreaker();

  function getVertexAI(): VertexAI {
    if (!vertexAI) {
      const project = process.env.GOOGLE_CLOUD_PROJECT;
      const location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
      if (!project) {
        throw new Error("GOOGLE_CLOUD_PROJECT environment variable is required");
      }
      vertexAI = new VertexAI({ project, location });
    }
    return vertexAI;
  }

  const pricing: Pricing = getPricing(DEFAULT_MODEL);

  return {
    name: "vertex",
    pricing,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      const generativeModel = getVertexAI().getGenerativeModel({
        model,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
          ...(opts?.topP !== undefined ? { topP: opts.topP } : {}),
          ...(opts?.stop ? { stopSequences: opts.stop } : {}),
        },
      });

      const systemParts = messages.filter((m) => m.role === "system");
      const conversationParts = messages.filter((m) => m.role !== "system");

      const contents = conversationParts.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const systemInstruction = systemParts.length > 0
        ? { role: "user" as const, parts: [{ text: systemParts.map((m) => m.content).join("\n\n") }] }
        : undefined;

      const start = performance.now();

      const response = await cb.execute(() =>
        generativeModel.generateContent({
          contents,
          ...(systemInstruction ? { systemInstruction } : {}),
        }),
      );

      const latencyMs = performance.now() - start;
      const result = response.response;
      const text = result.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";

      const usage = {
        inputTokens: result.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
      };

      const modelPricing = getPricing(model);
      const cost = estimateCost(usage, modelPricing);

      logger.debug("vertex chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "vertex", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? DEFAULT_MODEL;
      const maxTokens = opts?.maxTokens ?? 4096;
      const temperature = opts?.temperature ?? 1;

      let resolveResponse: (value: LlmResponse) => void;
      const responsePromise = new Promise<LlmResponse>((resolve) => {
        resolveResponse = resolve;
      });

      async function* generate(): AsyncGenerator<StreamChunk> {
        const start = performance.now();
        let fullText = "";

        const generativeModel = getVertexAI().getGenerativeModel({
          model,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature,
            ...(opts?.topP !== undefined ? { topP: opts.topP } : {}),
            ...(opts?.stop ? { stopSequences: opts.stop } : {}),
          },
        });

        const systemParts = messages.filter((m) => m.role === "system");
        const conversationParts = messages.filter((m) => m.role !== "system");

        const contents = conversationParts.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

        const systemInstruction = systemParts.length > 0
          ? { role: "user" as const, parts: [{ text: systemParts.map((m) => m.content).join("\n\n") }] }
          : undefined;

        const streamResult = await generativeModel.generateContentStream({
          contents,
          ...(systemInstruction ? { systemInstruction } : {}),
        });

        for await (const chunk of streamResult.stream) {
          const delta = chunk.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("") ?? "";
          if (delta) {
            fullText += delta;
            yield { text: delta, done: false };
          }
        }

        yield { text: "", done: true };

        const latencyMs = performance.now() - start;
        const aggregated = await streamResult.response;
        const usage = {
          inputTokens: aggregated.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: aggregated.usageMetadata?.candidatesTokenCount ?? 0,
        };
        const modelPricing = getPricing(model);
        const cost = estimateCost(usage, modelPricing);

        resolveResponse!({
          text: fullText,
          model,
          provider: "vertex",
          usage,
          latencyMs,
          cost,
        });
      }

      const iterator = generate();

      return {
        [Symbol.asyncIterator]() {
          return iterator;
        },
        response: responsePromise,
      };
    },

    countTokens(text: string, model?: string): number {
      return countTokens(text, model);
    },
  };
}

// Self-register factory
registerProvider("vertex", createVertexProvider);
