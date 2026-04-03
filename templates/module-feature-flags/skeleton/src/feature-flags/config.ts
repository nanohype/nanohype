// ── Configuration ───────────────────────────────────────────────────
//
// Zod schema for validating flag service configuration at construction
// time. Catches misconfiguration before any store initialization.
//

import { z } from "zod";

export const FlagServiceConfigSchema = z.object({
  storeName: z.string().min(1, "storeName must be a non-empty string").default("memory"),
  storeConfig: z.record(z.unknown()).default({}),
  enableTracking: z.boolean().default(true),
});

export type ValidatedConfig = z.infer<typeof FlagServiceConfigSchema>;
