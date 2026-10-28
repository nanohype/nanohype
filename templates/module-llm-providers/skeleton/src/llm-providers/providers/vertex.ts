import {
  type GenerateContentParameters,
  type GenerateContentResponseUsageMetadata,
  GoogleGenAI,
  type GoogleGenAIOptions,
} from "@google/genai";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { REQUEST_TIMEOUT_MS, withRequestTimeout } from "../resilience/request-timeout.js";
import { guardStream } from "../resilience/stream-guard.js";
import { countTokens } from "../tokens/counter.js";
import type {
  ChatMessage,
  ChatOptions,
  LlmResponse,
  Pricing,
  StreamResponse,
  TokenUsage,
} from "../types.js";
import { estimateCost, getPricing } from "../types.js";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── Google Vertex AI Provider ──────────────────────────────────────
//
// Gemini models via @google/genai with Vertex AI as its backend
// (`vertexai: true`). Auth is Google Application Default Credentials
// (ADC), or the credentials `client.googleAuthOptions` names, and never an
// API key: the client is always given a project and location, so the SDK
// ignores a key in GOOGLE_API_KEY or GEMINI_API_KEY.
// createVertexProvider() returns an instance with its own client and
// circuit breaker; the registered `vertex` factory returns one such
// instance for the life of the process. Supports both request/response
// and streaming modes, and runs both through the circuit breaker under
// LLM_REQUEST_TIMEOUT_MS (120s by default; `requestTimeoutMs` sets it per
// instance): a request fails when its reply takes longer, and a stream
// when no event arrives for that long. Either way the request's abort
// signal fires, which drops the connection. resilience/request-timeout.ts
// gives the bound it puts on each mode.
//
// The SDK's own `httpOptions.timeout` stays unset: it bounds a stream's
// whole body rather than each wait for its next event, and its timer
// runs its full length after the call returns.
//
// Requests go to the generally available v1 API, where the SDK defaults
// to v1beta1; `client.apiVersion` sets another.
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
   * GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION name: `googleAuthOptions`,
   * which sets where credentials come from (ADC when unset), or
   * `httpOptions`, such as an API endpoint (`baseUrl`). They take no API
   * key, and the backend is always Vertex AI.
   */
  client?: Omit<GoogleGenAIOptions, "apiKey" | "enterprise" | "vertexai">;
}

/** The generateContent request for `messages`, which `abortSignal` cancels. */
function generateRequest(
  model: string,
  messages: ChatMessage[],
  opts: ChatOptions | undefined,
  abortSignal: AbortSignal,
): GenerateContentParameters {
  const systemParts = messages.filter((m) => m.role === "system");
  const conversationParts = messages.filter((m) => m.role !== "system");
  return {
    model,
    contents: conversationParts.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    config: {
      maxOutputTokens: opts?.maxTokens ?? 4096,
      temperature: opts?.temperature ?? 1,
      ...(opts?.topP !== undefined ? { topP: opts.topP } : {}),
      ...(opts?.stop ? { stopSequences: opts.stop } : {}),
      ...(systemParts.length > 0
        ? {
            systemInstruction: {
              role: "user",
              parts: [{ text: systemParts.map((m) => m.content).join("\n\n") }],
            },
          }
        : {}),
      abortSignal,
    },
  };
}

/** Token usage from a reply's usage metadata, zero where it reports none. */
function usageFrom(metadata: GenerateContentResponseUsageMetadata | undefined): TokenUsage {
  return {
    inputTokens: metadata?.promptTokenCount ?? 0,
    outputTokens: metadata?.candidatesTokenCount ?? 0,
  };
}

/**
 * A Vertex AI provider instance with its own client and circuit breaker.
 * The registered `vertex` provider is one of these, built with no options.
 */
export function createVertexProvider(options: VertexProviderOptions = {}): LlmProvider {
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  let client: GoogleGenAI | null = null;
  const cb = createCircuitBreaker();

  function getClient(): GoogleGenAI {
    if (!client) {
      const project = options.client?.project ?? process.env.GOOGLE_CLOUD_PROJECT;
      const location =
        options.client?.location ?? process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
      if (!project) {
        throw new Error("GOOGLE_CLOUD_PROJECT environment variable is required");
      }
      client = new GoogleGenAI({
        apiVersion: "v1",
        ...options.client,
        vertexai: true,
        project,
        location,
      });
    }
    return client;
  }

  const pricing: Pricing = getPricing(DEFAULT_MODEL);

  return {
    name: "vertex",
    pricing,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      const model = opts?.model ?? DEFAULT_MODEL;
      const models = getClient().models;

      const start = performance.now();

      const result = await cb.execute(() =>
        withRequestTimeout(requestTimeoutMs, (abortSignal) =>
          models.generateContent(generateRequest(model, messages, opts, abortSignal)),
        ),
      );

      const latencyMs = performance.now() - start;
      const text = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const usage = usageFrom(result.usageMetadata);

      const modelPricing = getPricing(model);
      const cost = estimateCost(usage, modelPricing);

      logger.debug("vertex chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "vertex", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      const model = opts?.model ?? DEFAULT_MODEL;

      let usageMetadata: GenerateContentResponseUsageMetadata | undefined;
      return guardStream(cb, requestTimeoutMs, {
        open: (abortSignal: AbortSignal) =>
          getClient().models.generateContentStream(
            generateRequest(model, messages, opts, abortSignal),
          ),
        // Each chunk that reports usage reports the reply's total so far.
        text(chunk) {
          if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
          return chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        },
        finish(text, latencyMs) {
          const usage = usageFrom(usageMetadata);
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
