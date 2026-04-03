import { z } from "zod";

// ── Billing Config Validation ──────────────────────────────────────
//
// Zod schema for validating BillingConfig at construction time.
// Catches misconfiguration early — before any provider is initialized.
//

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
    provider: z.string().optional(),
    currency: z.string().length(3).optional(),
    pricingRules: z.array(PricingRuleSchema).optional(),
    stripe: z
      .object({
        secretKey: z.string().optional(),
        webhookSecret: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export function validateConfig(config: unknown): void {
  const parsed = BillingConfigSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(`Invalid billing config: ${issues}`);
  }
}
