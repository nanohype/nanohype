import { registerProvider } from "./registry.js";
import type { AiProvider, ChatMessage } from "./types.js";

// ── Model Gateway Provider ──────────────────────────────────────────
//
// The Platform's ModelGateway: how the chat route reaches a model on the
// nanohype substrate. The eks-agent-platform operator runs one per Platform, an
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
// under. Every request names the route MODEL_ROUTE sets (`default`) as its
// model, never the model a chat request body names: the server decides
// which route a browser reaches, and the ModelGateway CR maps each route to
// a Bedrock model.
//
// Requests go out through `fetch`, not the Anthropic SDK. An SDK client
// given no credential resolves one from the environment and its config
// files and sends it, which here would hand a developer's personal key to
// whatever answers at the gateway address. The headers built below are
// the whole request.
//
// A request fails when the gateway takes longer than LLM_REQUEST_TIMEOUT_MS
// to answer it, and a stream when no event arrives for that long; either
// way the request's abort signal fires, which drops the connection. A
// stream a consumer stops reading early aborts its request too.
//

/**
 * The gateway root when MODEL_GATEWAY_ENDPOINT is unset or empty: the
 * Service the eks-agent-platform operator creates for the Platform this
 * project deploys under, named `<platform>-gateway` in the Platform's
 * namespace `tenants-<platform>`, listening on 8080.
 */
export const DEFAULT_MODEL_GATEWAY_ENDPOINT =
  "http://__PLATFORM_NAME__-gateway.tenants-__PLATFORM_NAME__.svc.cluster.local:8080";

/** The route a request names when MODEL_ROUTE sets none. */
export const DEFAULT_MODEL_ROUTE = "default";

/** How long a call waits on the gateway when LLM_REQUEST_TIMEOUT_MS sets nothing. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/** Where the gateway serves native Anthropic Messages, under its root. */
export const MESSAGES_PATH = "/anthropic/v1/messages";

/** The Messages API version every request declares. */
const ANTHROPIC_VERSION = "2023-06-01";

/** The reply length every request asks for, as the anthropic provider does. */
const MAX_TOKENS = 4096;

/** How much of a refusal's body an error message carries. */
const MAX_ERROR_DETAIL = 500;

/** A gateway answer other than a 2xx, or a reply the route cannot use. */
export class ModelGatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

/** A call the gateway did not answer, or a stream it went quiet on, within the timeout. */
export class ModelGatewayTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Model gateway did not answer within ${timeoutMs} ms`);
    this.name = "ModelGatewayTimeoutError";
  }
}

/**
 * The gateway root `value` names, without a trailing slash, and
 * DEFAULT_MODEL_GATEWAY_ENDPOINT when unset or empty. It is an http or https
 * URL with no path, query or fragment.
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

/**
 * The timeout `value` names, in milliseconds: a whole number from 1 to
 * 2147483647 (the longest delay a timer takes), and
 * DEFAULT_REQUEST_TIMEOUT_MS when unset or empty.
 */
export function parseRequestTimeout(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_REQUEST_TIMEOUT_MS;
  const ms = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(ms >= 1 && ms <= 2_147_483_647)) {
    throw new Error(
      `LLM_REQUEST_TIMEOUT_MS must be a whole number of milliseconds from 1 to 2147483647, got "${value}"`,
    );
  }
  return ms;
}

/** The gateway root MODEL_GATEWAY_ENDPOINT sets. */
export const MODEL_GATEWAY_ENDPOINT = parseGatewayEndpoint(process.env.MODEL_GATEWAY_ENDPOINT);

/** The route MODEL_ROUTE sets, and DEFAULT_MODEL_ROUTE when unset or empty. */
export const MODEL_ROUTE = process.env.MODEL_ROUTE || DEFAULT_MODEL_ROUTE;

/** The timeout LLM_REQUEST_TIMEOUT_MS sets. */
export const REQUEST_TIMEOUT_MS = parseRequestTimeout(process.env.LLM_REQUEST_TIMEOUT_MS);

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
 * `work`, or a ModelGatewayTimeoutError once `timeoutMs` passes first, when
 * `controller` aborts the request `work` waits on.
 */
async function within<T>(timeoutMs: number, controller: AbortController, work: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Settled ahead of the abort, which fails `work` with an AbortError
      // the race would otherwise report.
      reject(new ModelGatewayTimeoutError(timeoutMs));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** The text a Messages reply's content blocks carry, joined. */
function replyText(raw: unknown, status: number): string {
  const content = (raw as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) {
    throw new ModelGatewayError(status, "Model gateway sent a reply with no content");
  }
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        block?.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("");
}

interface StreamEvent {
  type?: string;
  delta?: { type?: string; text?: string };
  error?: { message?: string };
}

export interface GatewayProviderOptions {
  /** The gateway root. MODEL_GATEWAY_ENDPOINT when unset. */
  endpoint?: string;
  /** The route every request names. MODEL_ROUTE when unset. */
  route?: string;
  /**
   * How long a call waits on the gateway, in milliseconds: for its answer,
   * and for each event of a stream. REQUEST_TIMEOUT_MS when unset.
   */
  requestTimeoutMs?: number;
  /** The `fetch` requests go through. The global one when unset. */
  fetch?: typeof globalThis.fetch;
}

/** The gateway provider. */
export class GatewayProvider implements AiProvider {
  /** The route requests name, reported where a provider reports its model. */
  readonly defaultModel: string;

  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: GatewayProviderOptions = {}) {
    this.endpoint =
      options.endpoint === undefined
        ? MODEL_GATEWAY_ENDPOINT
        : parseGatewayEndpoint(options.endpoint);
    this.defaultModel = options.route || MODEL_ROUTE;
    this.timeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  /** The route every request names, whatever model the caller passes. */
  resolveModel(_model?: string): string {
    return this.defaultModel;
  }

  private async post(
    messages: ChatMessage[],
    stream: boolean,
    signal: AbortSignal,
  ): Promise<Response> {
    const send = this.options.fetch ?? globalThis.fetch;
    const res = await send(`${this.endpoint}${MESSAGES_PATH}`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({
        model: this.resolveModel(),
        max_tokens: MAX_TOKENS,
        messages: messages.map(({ role, content }) => ({ role, content })),
        ...(stream ? { stream: true } : {}),
      }),
    });
    if (!res.ok) throw await refusal(res);
    return res;
  }

  async sendMessage(messages: ChatMessage[], _model?: string): Promise<string> {
    const controller = new AbortController();
    return within(
      this.timeoutMs,
      controller,
      (async () => {
        const res = await this.post(messages, false, controller.signal);
        return replyText(await res.json(), res.status);
      })(),
    );
  }

  async *streamMessage(messages: ChatMessage[], _model?: string): AsyncIterable<string> {
    const controller = new AbortController();
    try {
      const res = await within(
        this.timeoutMs,
        controller,
        this.post(messages, true, controller.signal),
      );
      if (!res.body) throw new ModelGatewayError(res.status, "Model gateway sent no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let stopped = false;

      const parse = (line: string): string | undefined => {
        const trimmed = line.replace(/\r$/, "");
        if (!trimmed.startsWith("data:")) return undefined;
        let event: StreamEvent;
        try {
          event = JSON.parse(trimmed.slice(5).trim()) as StreamEvent;
        } catch {
          throw new ModelGatewayError(res.status, "Model gateway sent an unreadable stream event");
        }
        if (event.type === "error") {
          throw new ModelGatewayError(
            res.status,
            `Model gateway stream failed: ${event.error?.message ?? "no message"}`,
          );
        }
        if (event.type === "message_stop") stopped = true;
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          return event.delta.text;
        }
        return undefined;
      };

      try {
        while (true) {
          const { done, value } = await within(this.timeoutMs, controller, reader.read());
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const text = parse(line);
            if (text) yield text;
          }
        }
        const last = parse(buffer + decoder.decode());
        if (last) yield last;
      } finally {
        reader.releaseLock();
      }
      if (!stopped) {
        throw new ModelGatewayError(res.status, "Model gateway stream ended before message_stop");
      }
    } finally {
      controller.abort();
    }
  }
}

registerProvider("gateway", () => new GatewayProvider());
