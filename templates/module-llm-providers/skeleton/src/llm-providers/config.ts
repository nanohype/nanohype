// ── Provider Configuration ─────────────────────────────────────────
//
// Zod-validated configuration for createProviderRegistry(). Validates
// at construction time so misconfiguration fails fast.
//

import { z } from "zod";

export const ProviderConfigSchema = z.object({
  /** Default provider name. */
  defaultProvider: z.string().min(1).default("anthropic"),
  /** Default model override per provider. */
  models: z.record(z.string(), z.string()).optional(),
  /** Default max tokens. */
  maxTokens: z.number().int().positive().optional(),
  /**
   * Default temperature, applied to every request that sets none. It reaches
   * the providers and model ids ChatOptions.temperature names, and no others.
   */
  temperature: z.number().min(0).max(2).optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
