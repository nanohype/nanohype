// ── Knowledge Base Configuration ────────────────────────────────────
//
// Zod-validated configuration for createKnowledgeClient(). Validates
// at construction time so misconfiguration fails fast.
//

import { z } from "zod";

export const KnowledgeConfigSchema = z.object({
  /** Provider name to use. */
  provider: z.string().min(1).default("mock"),
  /** Provider-specific options (tokens, URLs, etc.). */
  options: z.record(z.unknown()).optional(),
});

export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>;
