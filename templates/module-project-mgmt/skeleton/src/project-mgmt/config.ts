// ── Provider Configuration ─────────────────────────────────────────
//
// Zod-validated configuration for createProjectClient(). Validates
// at construction time so misconfiguration fails fast.
//

import { z } from "zod";

export const ProjectConfigSchema = z.object({
  /** Default provider name. */
  defaultProvider: z.string().min(1).default("mock"),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
