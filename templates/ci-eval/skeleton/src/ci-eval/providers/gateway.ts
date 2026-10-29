import { z } from "zod";
import { registerProvider } from "./registry.js";
import type { LlmProvider } from "./types.js";

// ── Model Gateway Provider ──────────────────────────────────────────
//
// The Platform's ModelGateway: how an application on the nanohype
// substrate reaches a model. The eks-agent-platform operator runs one per
// Platform, an Envoy AI Gateway in the tenant's namespace that runs under
// the tenant's EKS Pod Identity, holds the Bedrock role, attaches the
// route's guardrail and rate limit, and signs each call. The operator's
// egress policy gives application pods a route to the gateway and to no
// model endpoint, so this is the provider that works on the substrate, and
// it holds and sends no credential of any kind.
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
// unless the caller names another. The ModelGateway CR maps each route to
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
// An eval run inside the cluster grades the routes the application under
// test calls, through the same gateway; MODEL_ROUTE picks one. A call
// fails when its reply takes longer than DEFAULT_REQUEST_TIMEOUT_MS
// (`requestTimeoutMs` sets it per instance); the request's abort signal
// fires then, which drops the connection.
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

/** How long a call waits on its reply when nothing sets a timeout, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

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

/** The text blocks of a reply, joined with `separator`. */
export function replyText(reply: GatewayMessage, separator = ""): string {
  return reply.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join(separator);
}

/** One Messages request: a system prompt, the conversation, and the route it names. */
export interface GatewayRequest {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  /** The route the request names. The client's route when unset. */
  route?: string;
  maxTokens: number;
}

export interface GatewayClientOptions {
  /** The gateway root. MODEL_GATEWAY_ENDPOINT when unset. */
  endpoint?: string;
  /** The route a request names when it names none. MODEL_ROUTE when unset. */
  route?: string;
  /** How long a call waits on its reply, in milliseconds. DEFAULT_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
  /** The `fetch` requests go through. The global one when unset. */
  fetch?: typeof globalThis.fetch;
}

/** A Messages client for the gateway. */
export function createGatewayClient(options: GatewayClientOptions = {}) {
  const endpoint =
    options.endpoint === undefined
      ? MODEL_GATEWAY_ENDPOINT
      : parseGatewayEndpoint(options.endpoint);
  const route = options.route || MODEL_ROUTE;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

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

    /** Sends `request` and returns the reply, failing on a refusal or at the timeout. */
    send(request: GatewayRequest): Promise<GatewayMessage> {
      const body = messagesBody(request);
      const send = options.fetch ?? globalThis.fetch;
      return withTimeout(requestTimeoutMs, async (signal) => {
        const res = await send(`${endpoint}${MESSAGES_PATH}`, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", "anthropic-version": ANTHROPIC_VERSION },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw await refusal(res);
        return messageSchema.parse(await res.json());
      });
    },
  };
}

/** A gateway provider with its own client. */
export function createGatewayProvider(options: GatewayClientOptions = {}): LlmProvider {
  const client = createGatewayClient(options);
  return {
    async complete(prompt: string): Promise<string> {
      const reply = await client.send({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 1024,
      });
      return replyText(reply);
    },
  };
}

// Self-register. The registry returns this one instance for every lookup.
const gatewayProvider = createGatewayProvider();
registerProvider("gateway", () => gatewayProvider);
