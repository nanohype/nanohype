import { type GenerateContentResponse, VertexAI, type VertexInit } from "@google-cloud/vertexai";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { REQUEST_TIMEOUT_MS, withRequestTimeout } from "../resilience/request-timeout.js";
import { guardStream } from "../resilience/stream-guard.js";
import { countTokens } from "../tokens/counter.js";
import type { ChatMessage, ChatOptions, LlmResponse, Pricing, StreamResponse } from "../types.js";
import { estimateCost, getPricing } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── Google Vertex AI Provider ──────────────────────────────────────
//
// Gemini models via @google-cloud/vertexai. Uses Google Application
// Default Credentials (ADC) for auth. createVertexProvider() returns an
// instance with its own client and circuit breaker; the registered
// `vertex` factory returns one such instance for the life of the process.
// Supports both request/response and streaming modes, and runs both
// through the circuit breaker under LLM_REQUEST_TIMEOUT_MS (120s by
// default; `requestTimeoutMs` sets it per instance): a request fails when
// its reply takes longer, and a stream when no event arrives for that
// long. resilience/request-timeout.ts gives the bound it puts on each
// mode.
//
// The SDK takes no abort signal, so a call the provider gives up on
// leaves its connection for the server to close. The SDK's own `timeout`
// request option stays unset: its timer runs its full length after the
// call returns, which holds a short-lived process open.
//
// Sends the caller's `temperature`, and 1 when the caller sets none, and
// the caller's `topP` when one is set.
//
// Auth: GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION env vars,
// plus ADC (gcloud auth application-default login).
//

const DEFAULT_MODEL = "gemini-2.0-flash";

export interface VertexProviderOptions {
  /**
   * How long a call waits on the model, in milliseconds: a whole request,
   * or each wait for a stream's next event. LLM_REQUEST_TIMEOUT_MS when unset.
   */
  requestTimeoutMs?: number;
  /**
   * Vertex AI client settings, applied over the project and location
   * GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION name: an API endpoint, or
   * the `googleAuthOptions` credentials come from.
   */
  client?: VertexInit;
}

/**
 * A Vertex AI provider instance with its own client and circuit breaker.
 * The registered `vertex` provider is one of these, built with no options.
 */
export function createVertexProvider(options: VertexProviderOptions = {}): LlmProvider {
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  let vertexAI: VertexAI | null = null;
  const cb = createCircuitBreaker();

  function getVertexAI(): VertexAI {
    if (!vertexAI) {
      const project = options.client?.project ?? process.env.GOOGLE_CLOUD_PROJECT;
      const location =
        options.client?.location ?? process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
      if (!project) {
        throw new Error("GOOGLE_CLOUD_PROJECT environment variable is required");
      }
      vertexAI = new VertexAI({ ...options.client, project, location });
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

      const systemInstruction =
        systemParts.length > 0
          ? {
              role: "user" as const,
              parts: [{ text: systemParts.map((m) => m.content).join("\n\n") }],
            }
          : undefined;

      const start = performance.now();

      const response = await cb.execute(() =>
        withRequestTimeout(requestTimeoutMs, () =>
          generativeModel.generateContent({
            contents,
            ...(systemInstruction ? { systemInstruction } : {}),
          }),
        ),
      );

      const latencyMs = performance.now() - start;
      const result = response.response;
      const text = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

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

      let aggregated: Promise<GenerateContentResponse> | undefined;
      return guardStream(cb, requestTimeoutMs, {
        async open() {
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

          const systemInstruction =
            systemParts.length > 0
              ? {
                  role: "user" as const,
                  parts: [{ text: systemParts.map((m) => m.content).join("\n\n") }],
                }
              : undefined;

          const streamResult = await generativeModel.generateContentStream({
            contents,
            ...(systemInstruction ? { systemInstruction } : {}),
          });
          // A failed stream also rejects the aggregate. The chunks report
          // that failure, so the aggregate's copy of it is dropped here.
          streamResult.response.catch(() => {});
          aggregated = streamResult.response;
          return streamResult.stream;
        },
        text: (chunk) => chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join(""),
        async finish(text, latencyMs) {
          const usageMetadata = (await aggregated)?.usageMetadata;
          const usage = {
            inputTokens: usageMetadata?.promptTokenCount ?? 0,
            outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
          };
          const cost = estimateCost(usage, getPricing(model));
          return { text, model, provider: "vertex", usage, latencyMs, cost };
        },
      });
    },

    countTokens(text: string, model?: string): number {
      return countTokens(text, model);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker holds across requests.
const vertexProvider = createVertexProvider();
registerProvider("vertex", () => vertexProvider);
