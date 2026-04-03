// ── Gateway Core Types ──────────────────────────────────────────────
//
// Shared interfaces for the LLM gateway. These are provider-agnostic
// and strategy-agnostic — every provider, routing strategy, and
// caching strategy works against these common shapes.
//

/** A single message in a conversation. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Options passed to gateway.chat(). */
export interface ChatOptions {
  /** Override the model for this request. */
  model?: string;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Temperature for sampling (0–2). */
  temperature?: number;
  /** Force a specific provider by name. */
  provider?: string;
  /** Tags for cost attribution (user, project, etc.). */
  tags?: Record<string, string>;
  /** Cache TTL override in milliseconds. */
  cacheTtl?: number;
  /** Additional provider-specific parameters. */
  params?: Record<string, unknown>;
}

/** Response from a gateway.chat() call. */
export interface GatewayResponse {
  /** The generated text. */
  text: string;
  /** Model that produced the response. */
  model: string;
  /** Provider that handled the request. */
  provider: string;
  /** Input tokens consumed. */
  inputTokens: number;
  /** Output tokens generated. */
  outputTokens: number;
  /** Request latency in milliseconds. */
  latencyMs: number;
  /** Whether this response was served from cache. */
  cached: boolean;
  /** Cost in USD for this request. */
  cost: number;
}

/** Configuration for createGateway(). */
export interface GatewayConfig {
  /** Ordered list of provider names to use. */
  providers: string[];
  /** Routing strategy name. Default: "static". */
  routingStrategy?: string;
  /** Caching strategy name. Default: "hash". */
  cachingStrategy?: string;
  /** Default model per provider. */
  models?: Record<string, string>;
  /** Default max tokens. */
  maxTokens?: number;
  /** Default temperature. */
  temperature?: number;
}
