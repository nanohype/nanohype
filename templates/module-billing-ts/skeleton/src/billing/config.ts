import { z } from "zod";

// ── Billing Config Validation ──────────────────────────────────────
//
// Zod schema for validating BillingConfig at construction time.
// Catches misconfiguration early — before any provider is initialized.
//

/**
 * The provider createBillingService selects when the config names none — the
 * payment provider this project was scaffolded with. The mock provider refuses
 * to start unless the config names it, so a default of "mock" fails closed
 * rather than accepting every webhook.
 */
export const DEFAULT_PROVIDER = "__PAYMENT_PROVIDER__";

/** Milliseconds before a single Stripe request is abandoned. */
export const DEFAULT_STRIPE_TIMEOUT_MS = 20_000;

/**
 * Network retries the Stripe SDK makes after a connection error, a 409, a 5xx,
 * or an answer carrying `Stripe-Should-Retry: true`, and never after one
 * carrying `Stripe-Should-Retry: false`.
 */
export const DEFAULT_STRIPE_MAX_NETWORK_RETRIES = 2;

const PricingTierSchema = z.object({
  upTo: z.number().positive().or(z.literal(Infinity)),
  unitPrice: z.number().min(0),
  label: z.string().optional(),
});

const PricingRuleSchema = z.object({
  metric: z.string().min(1, "metric must be a non-empty string"),
  model: z.enum(["per_unit", "tiered", "flat"]),
  unitPrice: z.number().min(0).optional(),
  flatAmount: z.number().min(0).optional(),
  tiers: z.array(PricingTierSchema).optional(),
});

/**
 * The two methods the Stripe SDK calls on a custom HTTP client: `getClientName`
 * while it builds every request's user agent, and `makeRequest` to send it.
 */
function isHttpClient(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const client = value as { getClientName?: unknown; makeRequest?: unknown };
  return typeof client.getClientName === "function" && typeof client.makeRequest === "function";
}

export const BillingConfigSchema = z
  .object({
    provider: z.string().min(1, "provider must be a non-empty string").optional(),
    currency: z.string().length(3).optional(),
    pricingRules: z.array(PricingRuleSchema).optional(),
    stripe: z
      .object({
        secretKey: z.string().optional(),
        webhookSecret: z.string().optional(),
        timeoutMs: z.number().int().positive().optional(),
        maxNetworkRetries: z.number().int().min(0).max(10).optional(),
        httpClient: z
          .custom(isHttpClient, "httpClient must implement getClientName() and makeRequest()")
          .optional(),
      })
      .optional(),
  })
  .passthrough();

export function validateConfig(config: unknown): void {
  const parsed = BillingConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid billing config: ${issues}`);
  }
}
