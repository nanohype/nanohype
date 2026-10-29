/**
 * Platform ModelGateway embedding provider: how a cache on the nanohype
 * substrate reaches an embedding model. The eks-agent-platform operator runs
 * one gateway per Platform, an Envoy AI Gateway in the tenant's namespace that
 * runs under the tenant's EKS Pod Identity, holds the Bedrock role, and signs
 * each call. This provider holds and sends no credential of any kind.
 *
 * Requests speak the OpenAI embeddings shape at `<root>/v1/embeddings`,
 * naming the route EMBEDDING_ROUTE sets (`embeddings`) as the model and
 * forwarding the configured dimensions; the ModelGateway CR maps the route to
 * a Bedrock model, and EMBEDDING_MODEL plays no part. The gateway translates
 * the request to Bedrock Titan, which embeds one input per call and refuses a
 * batch, so embedBatch() sends one request per text. A reply whose vector is
 * not the configured width fails here rather than in a similarity search
 * against vectors of another width.
 *
 * The gateway serves each wire format under its own prefix, and a request
 * outside one matches no route while the gateway reports healthy, so
 * MODEL_GATEWAY_ENDPOINT is the gateway root, as ModelGateway status.endpoint
 * publishes it, and takes no path. Unset, it is the Service the operator
 * creates for the Platform this project deploys under.
 *
 * Requests go out through `fetch`, not a provider SDK. An SDK client given
 * no credential resolves one from the environment and its config files and
 * sends it, which here would hand a developer's personal key to whatever
 * answers at the gateway address. The headers built below are the whole
 * request.
 *
 * Every call runs through the provider's circuit breaker and carries an
 * AbortSignal that fires at EMBED_REQUEST_TIMEOUT_MS, the timeout every
 * embedding provider here reads, which drops the connection.
 *
 * The route's rate limit refuses a request with a 429, and a call sends it
 * again after the wait the reply's Retry-After header asks for, or after a
 * jittered backoff when it gives none: up to MAX_ATTEMPTS sends in all, and
 * only while the wait ends inside the call's timeout. The circuit breaker
 * counts a call that fails on a 5xx, a network error or the timeout. A 4xx,
 * the last 429 included, answers for the request rather than for the
 * gateway's health, so it fails the call without counting against the
 * breaker, and one caller's burst over the route's limit leaves the breaker
 * closed for every other caller.
 *
 * Registers itself as the "gateway" embedding provider on import, the
 * default for createSemanticCache().
 */

import { z } from "zod";
import { createCircuitBreaker } from "../circuit-breaker.js";
import { registerEmbeddingProvider } from "./registry.js";
import { EMBED_REQUEST_TIMEOUT_MS } from "./request-timeout.js";
import type { EmbeddingProvider } from "./types.js";

/**
 * The gateway root when MODEL_GATEWAY_ENDPOINT is unset or empty: the
 * Service the eks-agent-platform operator creates for the Platform this
 * project deploys under, named `<platform>-gateway` in the Platform's
 * namespace `tenants-<platform>`, listening on 8080.
 */
export const DEFAULT_MODEL_GATEWAY_ENDPOINT =
  "http://__PLATFORM_NAME__-gateway.tenants-__PLATFORM_NAME__.svc.cluster.local:8080";

/** The route a request names when EMBEDDING_ROUTE sets none. */
export const DEFAULT_EMBEDDING_ROUTE = "embeddings";

/** Where the gateway serves OpenAI embeddings, under its root. */
export const EMBEDDINGS_PATH = "/v1/embeddings";

/** The vector width when none is configured: Titan Text v2's default. */
export const DEFAULT_DIMENSIONS = 1024;

/** How much of a refusal's body an error message carries. */
const MAX_ERROR_DETAIL = 500;

/** A gateway answer other than a 2xx, or a reply the cache cannot use. */
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

/** The gateway root MODEL_GATEWAY_ENDPOINT sets. */
export const MODEL_GATEWAY_ENDPOINT = parseGatewayEndpoint(process.env.MODEL_GATEWAY_ENDPOINT);

/** The route EMBEDDING_ROUTE sets, and DEFAULT_EMBEDDING_ROUTE when unset or empty. */
export const EMBEDDING_ROUTE = process.env.EMBEDDING_ROUTE || DEFAULT_EMBEDDING_ROUTE;

// Never trust the wire: validate before reading.
const embeddingsSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
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

export interface GatewayEmbedderOptions {
  /** The gateway root. MODEL_GATEWAY_ENDPOINT when unset. */
  endpoint?: string;
  /** The route every request names. EMBEDDING_ROUTE when unset. */
  route?: string;
  /** The width of the vectors it asks for and accepts. DEFAULT_DIMENSIONS when unset. */
  dimensions?: number;
  /** How long a call waits, in milliseconds. EMBED_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
}

/** The gateway embedder. */
export class GatewayEmbedder implements EmbeddingProvider {
  readonly name = "gateway";

  private readonly endpoint: string;
  private readonly route: string;
  private readonly dims: number;
  private readonly requestTimeoutMs: number;
  private readonly cb = createCircuitBreaker();

  constructor(options: GatewayEmbedderOptions = {}) {
    this.endpoint =
      options.endpoint === undefined
        ? MODEL_GATEWAY_ENDPOINT
        : parseGatewayEndpoint(options.endpoint);
    this.route = options.route || EMBEDDING_ROUTE;
    this.dims = options.dimensions ?? DEFAULT_DIMENSIONS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? EMBED_REQUEST_TIMEOUT_MS;
  }

  get dimensions(): number {
    return this.dims;
  }

  async embed(text: string): Promise<number[]> {
    const reply = await this.cb.execute(async () => {
      const signal = AbortSignal.timeout(this.requestTimeoutMs);
      const body = JSON.stringify({ model: this.route, input: text, dimensions: this.dims });
      const answer = await sendUntilAnswered(
        () =>
          fetch(`${this.endpoint}${EMBEDDINGS_PATH}`, {
            method: "POST",
            signal,
            headers: { "content-type": "application/json" },
            body,
          }),
        signal,
        Date.now() + this.requestTimeoutMs,
      );
      return answer instanceof ModelGatewayError
        ? answer
        : embeddingsSchema.parse(await answer.json());
    });
    // A 4xx passed through the breaker as an answer; the call fails with it here.
    if (reply instanceof ModelGatewayError) throw reply;
    const embedding = reply.data[0]?.embedding;
    if (!embedding || embedding.length !== this.dims) {
      throw new ModelGatewayError(
        200,
        `Model gateway returned a ${embedding?.length ?? 0}-dimension vector, expected ${this.dims}`,
      );
    }
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (const text of texts) {
      vectors.push(await this.embed(text));
    }
    return vectors;
  }
}

// Self-register a factory — each createSemanticCache() gets a fresh circuit
// breaker.
registerEmbeddingProvider("gateway", () => new GatewayEmbedder());
