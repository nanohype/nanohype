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
   * Default temperature, applied to every request that sets none. The
   * OpenAI, Groq, Vertex, Hugging Face and Ollama providers send it, and so
   * does the Bedrock provider for a model outside the Claude family. No
   * Claude model receives it, whether through the Anthropic provider or
   * through Bedrock.
   */
  temperature: z.number().min(0).max(2).optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
