import { z } from "zod";
import { registerProvider } from "./registry.js";
import type { AiProvider, ChatMessage, ProviderSettings } from "./types.js";

// ── Model Gateway Provider ──────────────────────────────────────────
//
// A browser extension has no AWS credential chain to assume an IAM role
// through, and anything it stored in chrome.storage would be readable by
// whatever reads the browser profile, so the extension holds no model
// credential at all. It calls a Platform's ModelGateway at the endpoint the
// user sets on the options page, and the gateway, which runs under its
// tenant's EKS Pod Identity and holds the Bedrock role, signs the call.
//
// The gateway authenticates no caller: whoever reaches its Service spends
// the tenant's Bedrock access, and nothing records who they are. So the
// extension reaches it only through a `kubectl port-forward` to the gateway
// Service on this machine, which the Kubernetes API server authorizes as the
// user who opens it, and the endpoint is the address the forward listens on:
// http on localhost or 127.0.0.1. parseGatewayEndpoint refuses every other
// address, the stored one included, and the manifest's optional host
// permissions name no other origin.
//
// It speaks native Anthropic Messages at `<endpoint>/anthropic/v1/messages`,
// which the gateway serves for every route whose ModelGateway status
// reports api Anthropic, and names the route the options page sets as its
// model. The endpoint is the gateway root, as ModelGateway status.endpoint
// publishes it: the gateway serves each wire format under its own prefix,
// and a request outside one matches no route. Requests go out with
// `credentials: "omit"`, so the browser attaches no cookie or HTTP
// authentication it holds for the endpoint's origin; the headers built
// below are the whole request.
//
// A call fails when the gateway takes longer than REQUEST_TIMEOUT_MS to
// answer, and its abort signal drops the connection. The route's rate limit
// refuses a request with a 429, and a call sends it again after the wait
// the reply's Retry-After header asks for, or after a jittered backoff when
// it gives none: up to MAX_ATTEMPTS sends in all, and only while the wait
// ends inside the call's timeout.
//

/** Where the gateway serves native Anthropic Messages, under its root. */
export const MESSAGES_PATH = "/anthropic/v1/messages";

/** The route a request names when the options page sets none. */
export const DEFAULT_MODEL_ROUTE = "default";

/** How long a call waits on the gateway, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 60_000;

/** How many times a call sends its request: once, and again after each 429 while sends remain. */
export const MAX_ATTEMPTS = 3;

/** The Messages API version every request declares. */
const ANTHROPIC_VERSION = "2023-06-01";

/** The reply length every request asks for. */
const MAX_TOKENS = 4096;

/** How much of a refusal's body an error message carries. */
const MAX_ERROR_DETAIL = 500;

/** The longest wait before the first resend of a 429 that gives no Retry-After; it doubles per resend. */
const BACKOFF_BASE_MS = 500;

/** The hosts a port-forward listens on: the machine the browser runs on. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** A gateway answer other than a 2xx, or a reply the extension cannot read. */
export class ModelGatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

/** A call the gateway did not answer within the timeout. */
export class ModelGatewayTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Model gateway did not answer within ${timeoutMs} ms`);
    this.name = "ModelGatewayTimeoutError";
  }
}

/**
 * The gateway root `value` names, without a trailing slash: the address a
 * port-forward listens on, an http URL on a loopback host, with no path,
 * query or fragment. Throws on anything else, with a message the options
 * page shows.
 */
export function parseGatewayEndpoint(value: string): string {
  const trimmed = value.trim();
  let url: URL | undefined;
  try {
    url = new URL(trimmed);
  } catch {
    url = undefined;
  }
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    throw new Error(`The gateway endpoint must be an http URL, got "${value}"`);
  }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      `The gateway endpoint is the address a kubectl port-forward to the gateway Service listens ` +
        `on, http://localhost:<port> or http://127.0.0.1:<port>: the gateway authenticates no ` +
        `caller, so the extension reaches it through nothing else, got "${value}"`,
    );
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error(
      `The gateway endpoint is the gateway root, as ModelGateway status.endpoint publishes it, ` +
        `and takes no path, query or fragment, got "${value}"`,
    );
  }
  return trimmed.replace(/\/+$/, "");
}

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

// Never trust the wire: validate before reading.
const replySchema = z.object({
  content: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })),
});

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

export interface GatewayProviderOptions {
  /** How long a call waits on the gateway, in milliseconds. REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
  /** The `fetch` requests go through. The global one when unset. */
  fetch?: typeof globalThis.fetch;
}

/** A gateway provider. The registered `gateway` provider is one built with no options. */
export function createGatewayProvider(options: GatewayProviderOptions = {}): AiProvider {
  const timeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;

  async function call(messages: ChatMessage[], settings: ProviderSettings, signal: AbortSignal) {
    const send = options.fetch ?? globalThis.fetch;
    const url = `${parseGatewayEndpoint(settings.endpoint)}${MESSAGES_PATH}`;
    const body = JSON.stringify({
      model: settings.route || DEFAULT_MODEL_ROUTE,
      max_tokens: MAX_TOKENS,
      messages: messages.map(({ role, content }) => ({ role, content })),
    });
    const deadline = Date.now() + timeoutMs;

    for (let attempt = 0; ; attempt++) {
      const res = await send(url, {
        method: "POST",
        signal,
        credentials: "omit",
        headers: { "content-type": "application/json", "anthropic-version": ANTHROPIC_VERSION },
        body,
      });
      if (res.ok) {
        const reply = replySchema.safeParse(await res.json().catch(() => undefined));
        if (!reply.success) {
          throw new ModelGatewayError(res.status, "Model gateway sent a reply with no content");
        }
        return reply.data.content
          .filter((block) => block.type === "text" && block.text !== undefined)
          .map((block) => block.text)
          .join("");
      }
      const error = await refusal(res);
      if (res.status !== 429 || attempt + 1 >= MAX_ATTEMPTS) throw error;
      const wait = retryDelayMs(res.headers.get("retry-after"), attempt);
      if (Date.now() + wait >= deadline) throw error;
      await pause(wait, signal);
    }
  }

  return {
    async sendMessage(messages, settings) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new ModelGatewayTimeoutError(timeoutMs)),
        timeoutMs,
      );
      try {
        return await call(messages, settings, controller.signal);
      } catch (err) {
        // An abort rejects the pending fetch with the signal's reason, which
        // is the timeout error the timer set.
        throw controller.signal.aborted ? controller.signal.reason : err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

registerProvider("gateway", () => createGatewayProvider());
