/**
 * The Platform's ModelGateway: how a pipeline on the nanohype substrate reaches
 * a model, for generation and for embeddings. The eks-agent-platform operator
 * runs one per Platform, an Envoy AI Gateway in the tenant's namespace that
 * runs under the tenant's EKS Pod Identity, holds the Bedrock role, attaches
 * the route's guardrail and rate limit, and signs each call. These providers
 * hold and send no credential of any kind.
 *
 * The gateway serves each wire format under its own prefix, and a request
 * outside one matches no route while the gateway reports healthy, so
 * MODEL_GATEWAY_ENDPOINT is the gateway root, as ModelGateway
 * status.endpoint publishes it, and takes no path. Unset, it is the Service
 * the operator creates for the Platform this project deploys under.
 *
 * Generation speaks native Anthropic Messages at
 * `<root>/anthropic/v1/messages`, which the gateway serves for every route
 * whose ModelGateway status reports api Anthropic. A request names the
 * route MODEL_ROUTE sets (`default`) as its model, not the pipeline's
 * LLM_MODEL, which picks the model the bedrock, anthropic and openai
 * providers call; the ModelGateway CR maps each route to a Bedrock model.
 * Every route this provider reaches serves Claude, which takes no
 * `temperature`, so the configured one is not sent, and an instance logs the
 * first request that carries one, once, at debug level. The system prompt
 * goes out as one block carrying an ephemeral cache_control marker, which the
 * gateway hands Bedrock as the prompt caching point.
 *
 * Embeddings speak the OpenAI embeddings shape at `<root>/v1/embeddings`,
 * naming the route EMBEDDING_ROUTE sets (`embeddings`) and forwarding the
 * configured dimensions. The gateway translates the request to Bedrock
 * Titan, which embeds one input per call and refuses a batch, so
 * embedBatch() sends one request per text. A reply whose vector is not the
 * configured width fails here rather than at the vector store's insert.
 *
 * Requests go out through `fetch`, not a provider SDK. An SDK client given
 * no credential resolves one from the environment and its config files and
 * sends it, which here would hand a developer's personal key to whatever
 * answers at the gateway address. The headers built below are the whole
 * request.
 *
 * Every call runs through the instance's circuit breaker under the request
 * timeout the pipeline hands it (`requestTimeoutMs`, LLM_REQUEST_TIMEOUT_MS
 * through config.ts); the request's abort signal fires at the timeout, which
 * drops the connection.
 *
 * Registers itself as the "gateway" LLM provider and the "gateway" embedding
 * provider on import.
 */

import { z } from "zod";
import { logger } from "../logger.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, withRequestTimeout } from "../resilience/request-timeout.js";
import { registerEmbeddingProvider, registerLlmProvider } from "./registry.js";
import type { EmbeddingProvider, LlmProvider } from "./types.js";

/**
 * The gateway root when MODEL_GATEWAY_ENDPOINT is unset or empty: the
 * Service the eks-agent-platform operator creates for the Platform this
 * project deploys under, named `<platform>-gateway` in the Platform's
 * namespace `tenants-<platform>`, listening on 8080.
 */
export const DEFAULT_MODEL_GATEWAY_ENDPOINT =
  "http://__PLATFORM_NAME__-gateway.tenants-__PLATFORM_NAME__.svc.cluster.local:8080";

/** The route a generation request names when MODEL_ROUTE sets none. */
export const DEFAULT_MODEL_ROUTE = "default";

/** The route an embeddings request names when EMBEDDING_ROUTE sets none. */
export const DEFAULT_EMBEDDING_ROUTE = "embeddings";

/** Where the gateway serves native Anthropic Messages, under its root. */
export const MESSAGES_PATH = "/anthropic/v1/messages";

/** Where the gateway serves OpenAI embeddings, under its root. */
export const EMBEDDINGS_PATH = "/v1/embeddings";

/** The Messages API version every generation request declares. */
const ANTHROPIC_VERSION = "2023-06-01";

/** How much of a refusal's body an error message carries. */
const MAX_ERROR_DETAIL = 500;

/** A gateway answer other than a 2xx, or a reply the pipeline cannot use. */
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

/** The route MODEL_ROUTE sets, and DEFAULT_MODEL_ROUTE when unset or empty. */
export const MODEL_ROUTE = process.env.MODEL_ROUTE || DEFAULT_MODEL_ROUTE;

/** The route EMBEDDING_ROUTE sets, and DEFAULT_EMBEDDING_ROUTE when unset or empty. */
export const EMBEDDING_ROUTE = process.env.EMBEDDING_ROUTE || DEFAULT_EMBEDDING_ROUTE;

// Never trust the wire: validate before reading. The parts read are
// optional where a degraded gateway can leave them out.
const messageSchema = z.object({
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

/** What both gateway providers share: where they send, and how long they wait. */
export interface GatewayOptions {
  /** The gateway root. MODEL_GATEWAY_ENDPOINT when unset. */
  endpoint?: string;
  /** How long a call waits, in milliseconds. DEFAULT_REQUEST_TIMEOUT_MS when unset. */
  requestTimeoutMs?: number;
  /** The `fetch` requests go through. The global one when unset. */
  fetch?: typeof globalThis.fetch;
}

/** POSTs `body` as JSON to `url`, and fails on a refusal. */
async function post(
  options: GatewayOptions,
  url: string,
  headers: Record<string, string>,
  body: object,
  signal: AbortSignal,
): Promise<Response> {
  const send = options.fetch ?? globalThis.fetch;
  const res = await send(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await refusal(res);
  return res;
}

export interface GatewayLlmOptions extends GatewayOptions {
  /** The route every request names. MODEL_ROUTE when unset. */
  route?: string;
}

/** The gateway LLM. */
export class GatewayLlm implements LlmProvider {
  private readonly endpoint: string;
  private readonly route: string;
  private readonly requestTimeoutMs: number;
  private readonly cb = createCircuitBreaker();
  private droppedTemperatureLogged = false;

  constructor(private readonly options: GatewayLlmOptions = {}) {
    this.endpoint =
      options.endpoint === undefined
        ? MODEL_GATEWAY_ENDPOINT
        : parseGatewayEndpoint(options.endpoint);
    this.route = options.route || MODEL_ROUTE;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private noteDroppedTemperature(temperature: number | undefined): void {
    if (temperature === undefined || this.droppedTemperatureLogged) return;
    this.droppedTemperatureLogged = true;
    logger.debug("gateway sends no temperature", { temperature });
  }

  async generate(
    systemPrompt: string,
    userMessage: string,
    _model: string,
    temperature: number | undefined,
    maxTokens: number,
  ): Promise<{ answer: string; usage: Record<string, number> }> {
    this.noteDroppedTemperature(temperature);
    const body = {
      model: this.route,
      max_tokens: maxTokens,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    };
    const reply = await this.cb.execute(() =>
      withRequestTimeout(this.requestTimeoutMs, async (signal) => {
        const res = await post(
          this.options,
          `${this.endpoint}${MESSAGES_PATH}`,
          { "anthropic-version": ANTHROPIC_VERSION },
          body,
          signal,
        );
        return messageSchema.parse(await res.json());
      }),
    );

    const answer = reply.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n")
      .trim();
    const input = reply.usage?.input_tokens ?? 0;
    const output = reply.usage?.output_tokens ?? 0;
    const usage: Record<string, number> = {
      input_tokens: input,
      output_tokens: output,
      total_tokens: input + output,
      cache_read_tokens: reply.usage?.cache_read_input_tokens ?? 0,
      cache_write_tokens: reply.usage?.cache_creation_input_tokens ?? 0,
    };
    return { answer, usage };
  }
}

export interface GatewayEmbedderOptions extends GatewayOptions {
  /** The route every request names. EMBEDDING_ROUTE when unset. */
  route?: string;
  /** The width of the vectors it asks for and accepts. Default: 1024. */
  dimensions?: number;
}

/** The gateway embedder. */
export class GatewayEmbedder implements EmbeddingProvider {
  private readonly endpoint: string;
  private readonly route: string;
  private readonly dims: number;
  private readonly requestTimeoutMs: number;
  private readonly cb = createCircuitBreaker();

  constructor(private readonly options: GatewayEmbedderOptions = {}) {
    this.endpoint =
      options.endpoint === undefined
        ? MODEL_GATEWAY_ENDPOINT
        : parseGatewayEndpoint(options.endpoint);
    this.route = options.route || EMBEDDING_ROUTE;
    this.dims = options.dimensions ?? 1024;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  get dimensions(): number {
    return this.dims;
  }

  async embed(text: string): Promise<number[]> {
    const reply = await this.cb.execute(() =>
      withRequestTimeout(this.requestTimeoutMs, async (signal) => {
        const res = await post(
          this.options,
          `${this.endpoint}${EMBEDDINGS_PATH}`,
          {},
          { model: this.route, input: text, dimensions: this.dims },
          signal,
        );
        return embeddingsSchema.parse(await res.json());
      }),
    );
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

registerLlmProvider(
  "gateway",
  (settings) => new GatewayLlm({ requestTimeoutMs: settings.requestTimeoutMs }),
);
registerEmbeddingProvider(
  "gateway",
  (settings) =>
    new GatewayEmbedder({
      dimensions: settings.dimensions,
      requestTimeoutMs: settings.requestTimeoutMs,
    }),
);
