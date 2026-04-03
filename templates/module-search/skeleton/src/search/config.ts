// ── Search Configuration ──────────────────────────────────────────
//
// Zod-validated configuration for createSearchClient(). Validates
// at construction time so misconfiguration fails fast.
//

import { z } from "zod";

export const SearchClientConfigSchema = z.object({
  /** Default search provider name. */
  defaultProvider: z.string().min(1).default("mock"),
});

export type SearchClientConfig = z.infer<typeof SearchClientConfigSchema>;
