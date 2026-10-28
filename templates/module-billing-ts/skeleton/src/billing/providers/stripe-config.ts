import { z } from "zod";

// ── Stripe Provider Configuration ──────────────────────────────────
//
// The `stripe` block of BillingConfig: its type, its defaults, and the
// schema createBillingService validates it against before any provider
// starts. The block joins BillingConfig through ProviderConfigs, so the
// provider-agnostic types import nothing from this module.
//

declare module "../types.js" {
  interface ProviderConfigs {
    /** Stripe provider configuration. */
    stripe?: StripeConfig;
  }
}

/**
 * The shape of a key the Stripe provider authenticates with: a secret key
 * (`sk_`) or a restricted key (`rk_`), with no whitespace. A publishable key
 * (`pk_`) authenticates none of the calls the provider makes, and no key
 * Stripe issues carries whitespace, such as the trailing newline of a key
 * read from a file.
 */
export const STRIPE_SECRET_KEY_PATTERN = /^(?:sk|rk)_\S+$/;

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
  /**
   * Secret (`sk_`) or restricted (`rk_`) API key. Falls back to the
   * STRIPE_SECRET_KEY env var.
   */
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
   * chargeInvoice refuses to charge before the period start less this lead,
   * reporting `before_charge_window`. `lookbackMs` is never less than the
   * lead, so every charge of an ID lands inside the window every later charge
   * of it searches. Raise the lead freely. To lower it, keep `lookbackMs` at
   * the lead it replaces.
   */
  chargeLeadMs?: number;

  /**
   * How far before an invoice's period starts a charge searches for an
   * earlier charge of the same invoice ID, in milliseconds: it reads the
   * customer's Stripe invoices created since the period start less this and
   * an hour of clock skew. Defaults to `chargeLeadMs`, and is refused below
   * it, so the search reaches back to every charge the lead lets run.
   *
   * A search uses the value configured when it runs. Lowering it hides each
   * charge made further ahead of its period than the lowered value reaches,
   * and charging that invoice ID again creates and pays a second invoice.
   * While this is unset, lowering `chargeLeadMs` lowers it too, so a change
   * that lowers the lead sets this to the lead it replaces. Lower this only
   * once no invoice charged under the larger lead will be charged again, as a
   * retry or as its period regenerated. A larger value reads more of the
   * customer's invoices per charge, so a busy customer's search reaches
   * MAX_LISTED, and reports `lookup_exhausted`, sooner.
   */
  lookbackMs?: number;

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

/**
 * Refuses a key that is not a secret or restricted key, a webhook secret that
 * is not a string, a timeout that is not a positive integer, a retry count
 * outside 0-10, a lead or look-back that is negative or fractional, a
 * look-back shorter than the lead, and an HTTP client without
 * getClientName() and makeRequest().
 */
export const StripeConfigSchema = z
  .object({
    secretKey: z
      .string()
      .regex(
        STRIPE_SECRET_KEY_PATTERN,
        "secretKey must be a Stripe secret key (sk_...) or restricted key (rk_...)",
      )
      .optional(),
    webhookSecret: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    maxNetworkRetries: z.number().int().min(0).max(10).optional(),
    chargeLeadMs: z.number().int().min(0).optional(),
    lookbackMs: z.number().int().min(0).optional(),
    httpClient: z
      .custom(isHttpClient, "httpClient must implement getClientName() and makeRequest()")
      .optional(),
  })
  .refine(
    (config) =>
      config.lookbackMs === undefined ||
      config.lookbackMs >= (config.chargeLeadMs ?? DEFAULT_STRIPE_CHARGE_LEAD_MS),
    {
      error:
        "lookbackMs must be at least chargeLeadMs: a shorter search misses a charge made as far ahead of its period as the lead allows",
      path: ["lookbackMs"],
    },
  );
