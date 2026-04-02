import { z } from "zod";

// ── Config Schema ──────────────────────────────────────────────────
//
// Validates required environment variables at startup. If any value is
// missing or invalid the process logs the specific errors and exits
// immediately — no silent misconfiguration.
//

const configSchema = z.object({
  DISCORD_TOKEN: z
    .string()
    .min(1, "DISCORD_TOKEN is required"),

  DISCORD_CLIENT_ID: z
    .string()
    .min(1, "DISCORD_CLIENT_ID is required"),

  LLM_PROVIDER: z
    .string()
    .default("__LLM_PROVIDER__"),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
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
