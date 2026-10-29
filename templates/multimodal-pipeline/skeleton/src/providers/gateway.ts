import { z } from "zod";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { REQUEST_TIMEOUT_MS } from "../resilience/request-timeout.js";
import { registerProvider } from "./registry.js";
import type { AnalysisResult, MultimodalLlmProvider } from "./types.js";

// ── Model Gateway Provider ──────────────────────────────────────────
//
// The Platform's ModelGateway: how an application on the nanohype substrate
// reaches a model. The eks-agent-platform operator runs one per Platform, an
// Envoy AI Gateway in the tenant's namespace that runs under the tenant's EKS
// Pod Identity, holds the Bedrock role, attaches the route's guardrail and rate
// limit, and signs each call. This provider holds and sends no credential of
// any kind.
//
// It speaks native Anthropic Messages at
// `<MODEL_GATEWAY_ENDPOINT>/anthropic/v1/messages`, which the gateway
// serves for every route whose ModelGateway status reports api Anthropic.
// MODEL_GATEWAY_ENDPOINT is the gateway root, as ModelGateway
// status.endpoint publishes it. The gateway serves each wire format under
// its own prefix, and a request outside one matches no route while the
// gateway reports healthy, so the root takes no path. Unset, it is the
// Service the operator creates for the Platform this project deploys
// under. A request names a route as its model: MODEL_ROUTE (`default`)
// unless the instance sets another. The ModelGateway CR maps each route to
// a Bedrock model.
//
// Requests go out through `fetch`, not the Anthropic SDK. An SDK client
// given no credential resolves one from the environment and its config
// files and sends it, which here would hand a developer's personal key to
// whatever answers at the gateway address. The headers built below are
// the whole request. The system prompt goes out as one block carrying an
// ephemeral cache_control marker, which the gateway hands Bedrock as the
// prompt caching point.
//
// Images go out as base64 image blocks in the user turn. The request names
// the client's route, not the pipeline's LLM_MODEL, which picks the model
// the bedrock provider calls; the reply names the model the route served. Every route
// serves Claude, which takes no `temperature`, so the configured one is not
// sent, and an instance logs the first request that carries one, once, at
// debug level.
//
// Every call runs through the provider's circuit breaker and fails when
// its reply takes longer than LLM_REQUEST_TIMEOUT_MS (120s by default;
// `requestTimeoutMs` sets it per instance); the request's abort signal
// fires then, which drops the connection.
//
// The route's rate limit refuses a request with a 429, and a call sends it
// again after the wait the reply's Retry-After header asks for, or after a
// jittered backoff when it gives none: up to MAX_ATTEMPTS sends in all, and
// only while the wait ends inside the call's timeout. The circuit breaker
// counts a call that fails on a 5xx, a network error or the timeout. A 4xx,
// the last 429 included, answers for the request rather than for the
// gateway's health, so it fails the call without counting against the
// breaker, and one caller's burst over the route's limit leaves the breaker
// closed for every other caller.
//

/**
 * The gateway root when MODEL_GATEWAY_ENDPOINT is unset or empty: the
 * Service the eks-agent-platform operator creates for the Platform this
 * project deploys under, named `<platform>-gateway` in the Platform's
 * namespace `tenants-<platform>`, listening on 8080.
 */
export const DEFAULT_MODEL_GATEWAY_ENDPOINT =
  "http://__PLATFORM_NAME__-gateway.tenants-__PLATFORM_NAME__.svc.cluster.local:8080";

/** The route a request names when neither its caller nor MODEL_ROUTE set one. */
export const DEFAULT_MODEL_ROUTE = "default";

/** Where the gateway serves native Anthropic Messages, under its root. */
export const MESSAGES_PATH = "/anthropic/v1/messages";

/** The Messages API version every request declares. */
const ANTHROPIC_VERSION = "2023-06-01";

/** How much of a refusal's body an error message carries. */
const MAX_ERROR_DETAIL = 500;

/** A gateway answer other than a 2xx, or a stream that failed or ended early. */
export class ModelGatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

/**
 * The gateway root `value` names, without a trailing slash, and
 * DEFAULT_MODEL_GATEWAY_ENDPOINT when unset or empty. It is an http or
 * https URL with no path, query or fragment.
 */
export function parseGatewayEndpoint(value: string | undefined): string {
  if (value === undefined || value === "") return DEFAULT_MODEL_GATEWAY_ENDPOINT;
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {
    url = undefined;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(`MODEL_GATEWAY_ENDPOINT must be an http or https URL, got "${value}"`);
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error(
      `MODEL_GATEWAY_ENDPOINT is the gateway root, as ModelGateway status.endpoint publishes it, ` +
        `and takes no path, query or fragment, got "${value}"`,
    );
  }
  return value.replace(/\/+$/, "");
}

/** The gateway root MODEL_GATEWAY_ENDPOINT sets. */
export const MODEL_GATEWAY_ENDPOINT = parseGatewayEndpoint(process.env.MODEL_GATEWAY_ENDPOINT);

/** The route MODEL_ROUTE sets, and DEFAULT_MODEL_ROUTE when unset or empty. */
export const MODEL_ROUTE = process.env.MODEL_ROUTE || DEFAULT_MODEL_ROUTE;

/** A gateway call that outlasted its timeout. */
export class ModelGatewayTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`No answer from the model gateway within ${timeoutMs} ms`);
    this.name = "ModelGatewayTimeoutError";
  }
}

/**
 * Runs `call` and gives up on it after `timeoutMs`: the returned promise
 * rejects with ModelGatewayTimeoutError and the signal handed to `call`
 * aborts, which drops the connection. The timer is cleared when `call`
 * settles first.
 */
async function withTimeout<T>(
  timeoutMs: number,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new ModelGatewayTimeoutError(timeoutMs);
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([call(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

// Never trust the wire: validate before reading. The parts read are
// optional where a degraded gateway can leave them out.
const messageSchema = z.object({
  model: z.string().optional(),
  stop_reason: z.string().nullable().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_read_input_tokens: z.number().nullable(),
      cache_creation_input_tokens: z.number().nullable(),
    })
    .partial()
    .optional(),
});

/** A Messages reply, as the gateway returns it. */
export type GatewayMessage = z.infer<typeof messageSchema>;

/** The error a refusal carries: its status, and the message its body gives. */
async function refusal(res: Response): Promise<ModelGatewayError> {
  const body = await res.text().catch(() => "");
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown };
    const message = parsed.error?.message ?? parsed.message;
    if (typeof message === "string") detail = message;
  } catch {
    // Not JSON: Envoy answers a routing or upstream failure in plain text.
  }
  const shown = detail.trim().slice(0, MAX_ERROR_DETAIL) || res.statusText;
  return new ModelGatewayError(res.status, `Model gateway answered ${res.status}: ${shown}`);
}

/** How many times a call sends its request: once, and again after each 429 while sends remain. */
export const MAX_ATTEMPTS = 3;

/** The longest wait before the first resend of a 429 that gives no Retry-After; it doubles per resend. */
const BACKOFF_BASE_MS = 500;

/**
 * How long to wait before resending a request the gateway refused with a
 * 429 on send `attempt` (0 for the first): the delay its Retry-After value
 * gives, in seconds or as an HTTP date, and otherwise a backoff with full
 * jitter, up to BACKOFF_BASE_MS doubled per attempt.
 */
export function retryDelayMs(retryAfter: string | null, attempt: number, now = Date.now()): number {
  const value = retryAfter?.trim() ?? "";
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = /[a-z]/i.test(value) ? Date.parse(value) : Number.NaN;
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return Math.random() * BACKOFF_BASE_MS * 2 ** attempt;
}

/** Resolves after `ms`, or rejects with the signal's reason when it aborts first. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Sends a request through `send` until the gateway answers it, resending
 * it after a 429 while sends remain and the wait ends before `deadline`.
 * Returns the 2xx response, or the refusal of a 4xx, the last 429
 * included; throws the refusal of a 5xx.
 */
async function sendUntilAnswered(
  send: () => Promise<Response>,
  signal: AbortSignal,
  deadline: number,
): Promise<Response | ModelGatewayError> {
  for (let attempt = 0; ; attempt++) {
    const res = await send();
    if (res.ok) return res;
    const error = await refusal(res);
    if (res.status >= 500) throw error;
    if (res.status !== 429 || attempt + 1 >= MAX_ATTEMPTS) return error;
    const wait = retryDelayMs(res.headers.get("retry-after"), attempt);
    if (Date.now() + wait >= deadline) return error;
    await pause(wait, signal);
  }
}

/** The text blocks of a reply, joined with `separator`. */
export function replyText(reply: GatewayMessage, separator = ""): string {
  return reply.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join(separator);
}

/** A message's content: text, or Messages content blocks such as images. */
export type MessageContent = Record<string, unknown>[] | string;

/** One Messages request: a system prompt, the conversation, and the route it names. */
export interface GatewayRequest {
  system?: string;
  messages: { role: "user" | "assistant"; content: MessageContent }[];
  /** The route the request names. The client's route when unset. */
  route?: string;
  maxTokens: number;
}

export interface GatewayClientOptions {
  /** The gateway root. MODEL_GATEWAY_ENDPOINT when unset. */
  endpoint?: string;
  /** The route a request names when it names none. MODEL_ROUTE when unset. */
  route?: string;
  /** How long a call waits on its reply, in milliseconds. LLM_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
  /** The `fetch` requests go through. The global one when unset. */
  fetch?: typeof globalThis.fetch;
}

/** A Messages client for the gateway, with its own circuit breaker. */
export function createGatewayClient(options: GatewayClientOptions = {}) {
  const endpoint =
    options.endpoint === undefined
      ? MODEL_GATEWAY_ENDPOINT
      : parseGatewayEndpoint(options.endpoint);
  const route = options.route || MODEL_ROUTE;
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const cb = createCircuitBreaker();

  /** The Messages request body for `request`. */
  function messagesBody(request: GatewayRequest) {
    return {
      model: request.route ?? route,
      max_tokens: request.maxTokens,
      ...(request.system
        ? {
            system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
          }
        : {}),
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };
  }

  return {
    endpoint,
    route,

    /**
     * Sends `request` and returns the reply, resending it after a 429 as
     * sendUntilAnswered() does, and failing on a refusal or at the timeout.
     */
    async send(request: GatewayRequest): Promise<GatewayMessage> {
      const body = JSON.stringify(messagesBody(request));
      const send = options.fetch ?? globalThis.fetch;
      const outcome = await cb.execute(() =>
        withTimeout(requestTimeoutMs, async (signal) => {
          const answer = await sendUntilAnswered(
            () =>
              send(`${endpoint}${MESSAGES_PATH}`, {
                method: "POST",
                signal,
                headers: {
                  "content-type": "application/json",
                  "anthropic-version": ANTHROPIC_VERSION,
                },
                body,
              }),
            signal,
            Date.now() + requestTimeoutMs,
          );
          return answer instanceof ModelGatewayError
            ? answer
            : messageSchema.parse(await answer.json());
        }),
      );
      // A 4xx passed through the breaker as an answer; the call fails with it here.
      if (outcome instanceof ModelGatewayError) throw outcome;
      return outcome;
    },
  };
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** A gateway provider with its own client and circuit breaker. */
export function createGatewayProvider(options: GatewayClientOptions = {}): MultimodalLlmProvider {
  const client = createGatewayClient(options);
  let droppedTemperatureLogged = false;

  function noteDroppedTemperature(temperature: number | undefined): void {
    if (temperature === undefined || droppedTemperatureLogged) return;
    droppedTemperatureLogged = true;
    logger.debug("gateway sends no temperature", { temperature });
  }

  async function analyzeContent(
    content: MessageContent,
    systemPrompt: string,
    maxTokens: number,
  ): Promise<AnalysisResult> {
    const reply = await client.send({
      system: systemPrompt,
      messages: [{ role: "user", content }],
      maxTokens,
    });
    const input = reply.usage?.input_tokens ?? 0;
    const output = reply.usage?.output_tokens ?? 0;
    return {
      content: reply.content.find((block) => block.type === "text")?.text ?? "",
      model: reply.model ?? client.route,
      usage: { input_tokens: input, output_tokens: output, total_tokens: input + output },
    };
  }

  return {
    async analyze(input, systemPrompt, _model, temperature, maxTokens) {
      noteDroppedTemperature(temperature);
      const content: MessageContent = [];
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
      return analyzeContent(content, systemPrompt, maxTokens);
    },

    async analyzeFrames(frames, systemPrompt, _model, temperature, maxTokens) {
      noteDroppedTemperature(temperature);
      const content: MessageContent = frames.flatMap((data, i) => [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
        { type: "text", text: `Frame ${i + 1} of ${frames.length}` },
      ]);
      content.push({
        type: "text",
        text: "Analyze these video frames in sequence and provide a structured description of the video content.",
      });
      return analyzeContent(content, systemPrompt, maxTokens);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker and log-once state hold across requests.
const gatewayProvider = createGatewayProvider();
registerProvider("gateway", () => gatewayProvider);
