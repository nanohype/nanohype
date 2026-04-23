// ── Analytics Configuration ───────────────────────────────────────
//
// Zod-validated configuration for createAnalyticsClient(). Validates
// at construction time so misconfiguration fails fast.
//

import { z } from "zod";

export const AnalyticsClientConfigSchema = z.object({
  /** Default analytics provider name. */
  defaultProvider: z.string().min(1).default("mock"),
  /** Event buffer max size before auto-flush. */
  bufferMaxSize: z.number().int().positive().optional().default(100),
  /** Event buffer flush interval in ms. */
  bufferFlushIntervalMs: z.number().int().positive().optional().default(10_000),
});

export type AnalyticsClientConfig = z.infer<typeof AnalyticsClientConfigSchema>;
