// ── Gateway Core Types ────────────────────────────────────────────
//
// Shared interfaces for the API gateway. These define the shape of
// route rules, upstream targets, proxy responses, and the top-level
// configuration object. All mutable state (circuit breakers, rate
// limit buckets) is instance-scoped per upstream or per route —
// no module-level mutable state.
//

/** Authentication mode for a route. */
export type AuthMode = "jwt" | "api-key" | "none";

/** Rate limit configuration for a single route. */
export interface RateLimitRule {
  /** Maximum requests allowed within the window. */
  limit: number;

  /** Window duration in seconds. */
  window: number;
}

/** CORS configuration for a single route. */
export interface CorsRule {
  /** Allowed origins (exact strings or "*"). */
  origins: string[];

  /** Allowed HTTP methods. */
  methods?: string[];

  /** Allowed request headers. */
  allowHeaders?: string[];

  /** Headers exposed to the client. */
  exposeHeaders?: string[];

  /** Max age for preflight cache in seconds. */
  maxAge?: number;
}

/** Header transformation rule. */
export interface TransformRule {
  /** Headers to add or overwrite on the request before forwarding. */
  setRequestHeaders?: Record<string, string>;

  /** Headers to remove from the request before forwarding. */
  removeRequestHeaders?: string[];

  /** Headers to add or overwrite on the response before returning. */
  setResponseHeaders?: Record<string, string>;

  /** Headers to remove from the response before returning. */
  removeResponseHeaders?: string[];
}

/** Canary traffic splitting configuration. */
export interface CanaryConfig {
  /** Primary upstream URL. */
  primary: string;

  /** Canary upstream URL. */
  canary: string;

  /** Percentage of traffic routed to the canary (0-100). */
  canaryPercent: number;
}

/** A single upstream target. */
export interface UpstreamTarget {
  /** Upstream base URL (e.g., "http://users-service:3001"). */
  url: string;

  /** Health check path (default: "/health"). */
  healthPath?: string;

  /** Health check interval in milliseconds (default: 30000). */
  healthIntervalMs?: number;

  /** Number of consecutive failures before marking unhealthy (default: 3). */
  unhealthyThreshold?: number;

  /** Whether this upstream is currently healthy (runtime state). */
  healthy?: boolean;
}

/** A single route rule. */
export interface RouteRule {
  /** URL path pattern (supports trailing wildcard: "/api/users/*"). */
  path: string;

  /** Allowed HTTP methods. Empty array means all methods. */
  methods: string[];

  /** Upstream URL or canary configuration. */
  upstream: string | CanaryConfig;

  /** Authentication mode for this route (default: "none"). */
  auth?: AuthMode;

  /** Rate limit configuration for this route. */
  rateLimit?: RateLimitRule;

  /** CORS configuration for this route. */
  cors?: CorsRule;

  /** Header/body transformation rules. */
  transform?: TransformRule;

  /** Request timeout in milliseconds (default: 30000). */
  timeoutMs?: number;

  /** Strip the matched path prefix before forwarding. */
  stripPrefix?: boolean;
}

/** Result of proxying a request to an upstream. */
export interface ProxyResponse {
  /** HTTP status code from the upstream. */
  status: number;

  /** Response headers from the upstream. */
  headers: Record<string, string>;

  /** Response body as a ReadableStream (for streaming back to client). */
  body: ReadableStream<Uint8Array> | null;
}

/** Top-level gateway configuration. */
export interface GatewayConfig {
  /** Port to listen on (default: 8080). */
  port: number;

  /** Route rules defining path-to-upstream mappings. */
  routes: RouteRule[];

  /** JWT secret or JWKS URL for JWT auth mode. */
  jwtSecret?: string;

  /** JWKS endpoint URL for JWT validation. */
  jwksUrl?: string;

  /** Valid API keys for api-key auth mode. */
  apiKeys?: string[];

  /** Global request timeout in milliseconds (default: 30000). */
  defaultTimeoutMs?: number;

  /** Enable upstream health checking (default: true). */
  healthCheckEnabled?: boolean;

  /** Log level (default: "info"). */
  logLevel?: string;
}
