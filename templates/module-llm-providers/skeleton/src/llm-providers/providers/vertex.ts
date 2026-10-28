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
// (`enterprise: true`, the flag the SDK recommends over `vertexai`). The
// project is `client.project`, or GOOGLE_CLOUD_PROJECT, which is required
// when that is unset; the location is `client.location`, or
// GOOGLE_CLOUD_LOCATION, or us-central1. Auth is Google Application Default
// Credentials (ADC; `gcloud auth application-default login` on a
// workstation), or the credentials `client.googleAuthOptions` names, and
// never an API key: createVertexProvider() throws on a key in `client`, and
// the SDK ignores a key in GOOGLE_API_KEY or GEMINI_API_KEY because the
// client is always given a project and location.
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

const DEFAULT_MODEL = "gemini-2.0-flash";

/**
 * @google/genai's client options less the API key and backend flags, with
 * `googleAuthOptions` less its API key.
 */
type VertexClientOptions = Omit<
  GoogleGenAIOptions,
  "apiKey" | "enterprise" | "vertexai" | "googleAuthOptions"
> & {
  googleAuthOptions?: Omit<NonNullable<GoogleGenAIOptions["googleAuthOptions"]>, "apiKey">;
};

export interface VertexProviderOptions {
  /**
   * How long a call waits on the model, in milliseconds: a whole request,
   * or each wait for a stream's next event. LLM_REQUEST_TIMEOUT_MS when unset.
   */
  requestTimeoutMs?: number;
  /**
   * Vertex AI client settings, applied over the project and location
   * GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION name: `googleAuthOptions`,
   * which sets where credentials come from (ADC when unset), `httpOptions`,
   * such as an API endpoint (`baseUrl`), or `apiVersion`, v1 when unset.
   * They take no API key: their type leaves out `apiKey` and
   * `googleAuthOptions.apiKey`, and createVertexProvider() throws on a key
   * in either, or in `googleAuthOptions.clientOptions` or
   * `googleAuthOptions.authClient`. The backend is always Vertex AI.
   */
  client?: VertexClientOptions;
}

/** Client options read for an API key, whatever type they were passed as. */
interface ApiKeyFields {
  apiKey?: unknown;
  googleAuthOptions?: {
    apiKey?: unknown;
    clientOptions?: { apiKey?: unknown };
    authClient?: { apiKey?: unknown };
  };
}

/**
 * Throws when `client` sets an API key in a field @google/genai or
 * google-auth-library would send it from in place of credentials. The type
 * of `client` leaves out `apiKey` and `googleAuthOptions.apiKey`, which a
 * JavaScript caller or a cast still reaches.
 */
function rejectApiKey(client: VertexClientOptions | undefined): void {
  const fields = client as ApiKeyFields | undefined;
  const auth = fields?.googleAuthOptions;
  const keys: [string, unknown][] = [
    ["client.apiKey", fields?.apiKey],
    ["client.googleAuthOptions.apiKey", auth?.apiKey],
    ["client.googleAuthOptions.clientOptions.apiKey", auth?.clientOptions?.apiKey],
    ["client.googleAuthOptions.authClient.apiKey", auth?.authClient?.apiKey],
  ];
  for (const [field, key] of keys) {
    if (key !== undefined) {
      throw new Error(
        `vertex authenticates with Google credentials, never an API key: unset ${field}`,
      );
    }
  }
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
  rejectApiKey(options.client);
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
        enterprise: true,
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
        // In @google/genai's stream, a chunk's usageMetadata is the reply's
        // running total: the server's within one request, summed by the SDK
        // across the requests of a resumed stream. The last chunk that
        // reports usage holds the reply's.
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
