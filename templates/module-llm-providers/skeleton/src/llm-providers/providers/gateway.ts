import { z } from "zod";
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

// ── Gateway Provider ───────────────────────────────────────────────
//
// The Platform's ModelGateway: how an application on the nanohype substrate
// reaches a model. The eks-agent-platform operator runs one per Platform, an
// Envoy AI Gateway in the tenant's namespace that runs under the tenant's EKS
// Pod Identity, holds the Bedrock role, attaches the route's guardrail and rate
// limit, and signs each call. This provider holds and sends no credential of
// any kind.
//
// It speaks native Anthropic Messages at
// `<MODEL_GATEWAY_ENDPOINT>/anthropic/v1/messages`, which keeps prompt
// caching and the model's own response shape end to end, and which the
// gateway serves for every route whose ModelGateway status reports api
// Anthropic: every anthropic-family route that does not pin another.
// MODEL_GATEWAY_ENDPOINT is the gateway root, as ModelGateway
// status.endpoint publishes it. The gateway serves each wire format under
// its own prefix, and a request outside one matches no route while the
// gateway reports healthy, so the root takes no path. Unset, it is the
// Service the operator creates for the Platform this project deploys
// under. A request names a route as its model: `opts.model`, or
// MODEL_ROUTE (`default`) when that is unset. The ModelGateway CR maps
// each route to a Bedrock model.
//
// Requests go out through `fetch`, not the Anthropic SDK. An SDK client
// given no credential resolves one from the environment and its config
// files and sends it, which here would hand a developer's personal key
// to whatever answers at the gateway address. The headers built below
// are the whole request.
//
// The system prompt goes out as one block carrying an ephemeral
// cache_control marker, which the gateway hands Bedrock as the policy's
// prompt-caching point; cache read and write tokens flow through to
// TokenUsage. Every route this provider reaches serves Claude, which
// takes no `temperature`, `top_p` or `top_k` (the anthropic provider's
// header gives why), so neither request mode sends them; an instance
// logs the first request that sets one, once, at debug level.
//
// createGatewayProvider() returns an instance with its own circuit
// breaker; the registered `gateway` factory returns one such instance
// for the life of the process. Both request modes run through the
// breaker under LLM_REQUEST_TIMEOUT_MS (`requestTimeoutMs` sets it per
// instance): a request fails when its reply takes longer, and a stream
// when no event arrives for that long. Either way the request's abort
// signal fires, which drops the connection. resilience/request-timeout.ts
// gives the bound it puts on each mode.
//

/**
 * The gateway root when MODEL_GATEWAY_ENDPOINT is unset or empty: the
 * Service the eks-agent-platform operator creates for the Platform this
 * project deploys under, named `<platform>-gateway` in the Platform's
 * namespace `tenants-<platform>`, listening on 8080.
 */
export const DEFAULT_MODEL_GATEWAY_ENDPOINT =
  "http://__PLATFORM_NAME__-gateway.tenants-__PLATFORM_NAME__.svc.cluster.local:8080";

/** The route a request names when neither its options nor MODEL_ROUTE set one. */
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

// Never trust the wire: validate before reading. The parts read are
// optional where a degraded or older gateway can leave them out.
const usageSchema = z
  .object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_read_input_tokens: z.number().nullable(),
    cache_creation_input_tokens: z.number().nullable(),
  })
  .partial();

type WireUsage = z.infer<typeof usageSchema>;

const messageSchema = z.object({
  model: z.string().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: usageSchema.optional(),
});

const streamEventSchema = z.object({
  type: z.string(),
  message: z.object({ model: z.string().optional(), usage: usageSchema.optional() }).optional(),
  delta: z.object({ type: z.string().optional(), text: z.string().optional() }).optional(),
  usage: usageSchema.optional(),
  error: z.object({ message: z.string().optional() }).optional(),
});

type StreamEvent = z.infer<typeof streamEventSchema>;

/** The TokenUsage a reply's wire usage reports, cache tokens when it reports them. */
function tokenUsage(usage: WireUsage | undefined): TokenUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    ...(usage?.cache_read_input_tokens != null
      ? { cacheReadTokens: usage.cache_read_input_tokens }
      : {}),
    ...(usage?.cache_creation_input_tokens != null
      ? { cacheWriteTokens: usage.cache_creation_input_tokens }
      : {}),
  };
}

/**
 * `next` over `prior`, field by field. A stream reports usage twice, at
 * message_start and again at message_delta, and a field the second leaves
 * out or nulls keeps the value the first reported.
 */
function mergeUsage(prior: WireUsage, next: WireUsage | undefined): WireUsage {
  const merged: WireUsage = { ...prior };
  for (const [key, value] of Object.entries(next ?? {}) as [keyof WireUsage, number | null][]) {
    if (value != null) merged[key] = value;
  }
  return merged;
}

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

/**
 * The Messages events an SSE body carries, and an error for a stream that
 * reports one, carries an unreadable event, or ends before message_stop.
 */
async function* messageEvents(
  body: ReadableStream<Uint8Array>,
  status: number,
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopped = false;

  function parse(line: string): StreamEvent | undefined {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed.startsWith("data:")) return undefined;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed.slice(5).trim());
    } catch {
      throw new ModelGatewayError(status, "Model gateway sent an unreadable stream event");
    }
    const event = streamEventSchema.parse(raw);
    if (event.type === "error") {
      throw new ModelGatewayError(
        status,
        `Model gateway stream failed: ${event.error?.message ?? "no message"}`,
      );
    }
    if (event.type === "message_stop") stopped = true;
    return event;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parse(line);
      if (event) yield event;
    }
  }
  const last = parse(buffer + decoder.decode());
  if (last) yield last;
  if (!stopped) {
    throw new ModelGatewayError(status, "Model gateway stream ended before message_stop");
  }
}

export interface GatewayProviderOptions {
  /** The gateway root. MODEL_GATEWAY_ENDPOINT when unset. */
  endpoint?: string;
  /** The route a request names when its options set no model. MODEL_ROUTE when unset. */
  route?: string;
  /**
   * How long a call waits on the model, in milliseconds: a whole request,
   * or each wait for a stream's next event. LLM_REQUEST_TIMEOUT_MS when
   * unset.
   */
  requestTimeoutMs?: number;
  /** The `fetch` requests go through. The global one when unset. */
  fetch?: typeof globalThis.fetch;
}

/**
 * A gateway provider instance with its own circuit breaker. The registered
 * `gateway` provider is one of these, built with no options.
 */
export function createGatewayProvider(options: GatewayProviderOptions = {}): LlmProvider {
  const endpoint =
    options.endpoint === undefined
      ? MODEL_GATEWAY_ENDPOINT
      : parseGatewayEndpoint(options.endpoint);
  const route = options.route || MODEL_ROUTE;
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const cb = createCircuitBreaker();
  const pricing: Pricing = getPricing("claude-sonnet-5");

  let droppedSamplingLogged = false;
  function noteDroppedSampling(opts?: ChatOptions): void {
    if (droppedSamplingLogged) return;
    if (opts?.temperature === undefined && opts?.topP === undefined) return;
    droppedSamplingLogged = true;
    logger.debug("gateway sends no sampling options", {
      temperature: opts.temperature,
      topP: opts.topP,
    });
  }

  /** The Messages request body for `messages`; both request modes send it. */
  function messagesBody(messages: ChatMessage[], opts: ChatOptions | undefined) {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    return {
      model: opts?.model ?? route,
      max_tokens: opts?.maxTokens ?? 4096,
      ...(system
        ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] }
        : {}),
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
      ...(opts?.stop ? { stop_sequences: opts.stop } : {}),
    };
  }

  /** POSTs `body` to the gateway's Messages endpoint, and fails on a refusal. */
  async function post(body: object, signal: AbortSignal): Promise<Response> {
    const send = options.fetch ?? globalThis.fetch;
    const res = await send(`${endpoint}${MESSAGES_PATH}`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await refusal(res);
    return res;
  }

  return {
    name: "gateway",
    pricing,
    sampling: () => ({}),

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LlmResponse> {
      noteDroppedSampling(opts);
      const body = messagesBody(messages, opts);
      const start = performance.now();

      const reply = await cb.execute(() =>
        withRequestTimeout(requestTimeoutMs, async (signal) =>
          messageSchema.parse(await (await post(body, signal)).json()),
        ),
      );

      const latencyMs = performance.now() - start;
      const text = reply.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      const model = reply.model ?? body.model;
      const usage = tokenUsage(reply.usage);
      const cost = estimateCost(usage, getPricing(model));

      logger.debug("gateway chat complete", { model, ...usage, latencyMs, cost });

      return { text, model, provider: "gateway", usage, latencyMs, cost };
    },

    streamChat(messages: ChatMessage[], opts?: ChatOptions): StreamResponse {
      noteDroppedSampling(opts);
      const body = { ...messagesBody(messages, opts), stream: true };
      let model = body.model;
      let wireUsage: WireUsage = {};

      return guardStream(cb, requestTimeoutMs, {
        async open(signal: AbortSignal) {
          const res = await post(body, signal);
          return res.body ? messageEvents(res.body, res.status) : undefined;
        },
        text(event) {
          if (event.type === "message_start") {
            model = event.message?.model ?? model;
            wireUsage = mergeUsage(wireUsage, event.message?.usage);
          } else if (event.type === "message_delta") {
            wireUsage = mergeUsage(wireUsage, event.usage);
          }
          return event.type === "content_block_delta" && event.delta?.type === "text_delta"
            ? event.delta.text
            : undefined;
        },
        finish(text, latencyMs) {
          const usage = tokenUsage(wireUsage);
          const cost = estimateCost(usage, getPricing(model));
          return { text, model, provider: "gateway", usage, latencyMs, cost };
        },
      });
    },

    countTokens(text: string, model?: string): number {
      return countTokens(text, model);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup,
// so its circuit breaker and log-once state hold across requests.
const gatewayProvider = createGatewayProvider();
registerProvider("gateway", () => gatewayProvider);
