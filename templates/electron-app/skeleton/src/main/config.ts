import { z } from "zod";

// ── Config Schema ──────────────────────────────────────────────────
//
// Validates environment variables at startup. Electron's main process
// owns all secrets — the renderer never touches them. If any value is
// missing or invalid the process logs the specific errors and exits
// immediately — no silent misconfiguration.
//

const configSchema = z.object({
  LLM_PROVIDER: z
    .string()
    .default("__LLM_PROVIDER__"),

  ANTHROPIC_API_KEY: z
    .string()
    .optional(),

  OPENAI_API_KEY: z
    .string()
    .optional(),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Parse and validate environment variables against the config schema.
 * Returns the typed config on success; logs validation errors and
 * terminates the process on failure.
 */
export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error("[config] Invalid configuration:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}
