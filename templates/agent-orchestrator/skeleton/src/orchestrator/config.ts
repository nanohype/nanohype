// ── Configuration ───────────────────────────────────────────────────
//
// Zod schema for validating orchestrator configuration at construction
// time. Catches misconfiguration before any agent or provider
// initialization.
//

import { z } from "zod";

export const OrchestratorConfigSchema = z.object({
  providerName: z.string().min(1).default("mock"),
  maxSubtasks: z.number().int().min(1).max(50).default(10),
  timeoutMs: z.number().int().min(1000).default(300_000),
});

export type ValidatedConfig = z.infer<typeof OrchestratorConfigSchema>;
