import { z } from "zod";

// ── Stripe Provider Configuration ──────────────────────────────────
//
// The `stripe` block of BillingConfig: its type, its defaults, and the
// schema createBillingService validates it against before any provider
// starts. The provider-agnostic types name the block and nothing in it.
//

/** Milliseconds before a single Stripe request is abandoned. */
export const DEFAULT_STRIPE_TIMEOUT_MS = 20_000;

/**
 * Network retries the Stripe SDK makes after a connection error, a 409, a 5xx,
 * or an answer carrying `Stripe-Should-Retry: true`, and never after one
 * carrying `Stripe-Should-Retry: false`.
 */
export const DEFAULT_STRIPE_MAX_NETWORK_RETRIES = 2;

/** How long before its period starts an invoice may be charged: not at all, for billing in arrears. */
export const DEFAULT_STRIPE_CHARGE_LEAD_MS = 0;

/**
 * A transport the Stripe SDK sends requests through: the two methods the SDK
 * calls on a custom HTTP client, `getClientName` for its user agent and
 * `makeRequest` for every request. `Stripe.createFetchHttpClient()` and
 * `Stripe.createNodeHttpClient()` return one.
 */
export interface StripeHttpClient {
  getClientName(): string;
  makeRequest(...args: never[]): Promise<unknown>;
}

/** The Stripe provider's configuration, the `stripe` block of BillingConfig. */
export interface StripeConfig {
  /** Secret API key. Falls back to the STRIPE_SECRET_KEY env var. */
  secretKey?: string;

  /** Webhook endpoint signing secret. Falls back to STRIPE_WEBHOOK_SECRET. */
  webhookSecret?: string;

  /**
   * Milliseconds the SDK gives one attempt at a Stripe request before
   * abandoning it. Each retry `maxNetworkRetries` allows gets this again.
   * Defaults to DEFAULT_STRIPE_TIMEOUT_MS.
   */
  timeoutMs?: number;

  /**
   * Retries the SDK makes, with exponential backoff of up to 5 seconds, after
   * a connection error, a 409, a 5xx, or an answer carrying
   * `Stripe-Should-Retry: true`, and never after one carrying
   * `Stripe-Should-Retry: false`. Defaults to
   * DEFAULT_STRIPE_MAX_NETWORK_RETRIES. The SDK also retries a connection
   * closed on the first attempt once, even when this is 0.
   *
   * A retried write is applied once. Every POST chargeInvoice makes carries
   * an idempotency key, and Stripe answers a retry of one it already applied
   * with the stored response. A DELETE carries no key: a retry of one Stripe
   * already applied finds nothing to delete and answers 404, which
   * chargeInvoice reads as done.
   */
  maxNetworkRetries?: number;

  /**
   * How far ahead of an invoice's period starting chargeInvoice may charge
   * it, in milliseconds. Defaults to DEFAULT_STRIPE_CHARGE_LEAD_MS, for
   * billing in arrears; billing in advance sets it to the furthest ahead of a
   * period this service charges.
   *
   * The lead bounds both ends of one window. A charge looks for an earlier
   * charge of the same invoice ID among the customer's Stripe invoices
   * created since the period start less this lead and an hour of clock skew,
   * and chargeInvoice refuses to charge before the period start less this
   * lead, reporting `before_charge_window`. Every charge of an ID therefore
   * lands inside the window every later charge of it searches.
   */
  chargeLeadMs?: number;

  /**
   * HTTP client the SDK sends requests through. Defaults to the SDK's Node
   * client; pass `Stripe.createFetchHttpClient()` on a runtime without
   * `node:http`, or a client backed by a fake `fetch` in tests.
   */
  httpClient?: StripeHttpClient;
}

/**
 * The two methods the Stripe SDK calls on a custom HTTP client: `getClientName`
 * while it builds every request's user agent, and `makeRequest` to send it.
 */
function isHttpClient(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const client = value as { getClientName?: unknown; makeRequest?: unknown };
  return typeof client.getClientName === "function" && typeof client.makeRequest === "function";
}

/** Refuses a malformed key, timeout, retry count, lead or HTTP client. */
export const StripeConfigSchema = z.object({
  secretKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxNetworkRetries: z.number().int().min(0).max(10).optional(),
  chargeLeadMs: z.number().int().min(0).optional(),
  httpClient: z
    .custom(isHttpClient, "httpClient must implement getClientName() and makeRequest()")
    .optional(),
});
