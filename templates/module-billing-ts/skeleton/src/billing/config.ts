import { z } from "zod";
import { StripeConfigSchema } from "./providers/stripe-config.js";

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

export const BillingConfigSchema = z
  .object({
    provider: z.string().min(1, "provider must be a non-empty string").optional(),
    currency: z.string().length(3).optional(),
    pricingRules: z.array(PricingRuleSchema).optional(),
    idGenerator: z
      .custom((value) => typeof value === "function", "idGenerator must be a function")
      .optional(),
    stripe: StripeConfigSchema.optional(),
  })
  .passthrough();

export function validateConfig(config: unknown): void {
  const parsed = BillingConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid billing config: ${issues}`);
  }
}
