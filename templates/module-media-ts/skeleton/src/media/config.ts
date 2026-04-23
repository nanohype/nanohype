// ── Media Configuration ───────────────────────────────────────────
//
// Zod-validated configuration for createMediaClient(). Validates
// at construction time so misconfiguration fails fast.
//

import { z } from "zod";

export const MediaClientConfigSchema = z.object({
  /** Default media provider name. */
  defaultProvider: z.string().min(1).default("mock"),
});

export type MediaClientConfig = z.infer<typeof MediaClientConfigSchema>;
