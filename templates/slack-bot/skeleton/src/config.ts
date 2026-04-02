import { z } from "zod";

// ── Config Schema ──────────────────────────────────────────────────
//
// Validates required environment variables at startup. If any value is
// missing or invalid the process logs the specific errors and exits
// immediately — no silent misconfiguration.
//

const configSchema = z.object({
  SLACK_BOT_TOKEN: z
    .string()
    .min(1, "SLACK_BOT_TOKEN is required"),

  SLACK_APP_TOKEN: z
    .string()
    .optional(),

  SLACK_SIGNING_SECRET: z
    .string()
    .min(1, "SLACK_SIGNING_SECRET is required"),

  LLM_PROVIDER: z
    .string()
    .default("__LLM_PROVIDER__"),

  PORT: z
    .string()
    .default("3000")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  SOCKET_MODE: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
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
