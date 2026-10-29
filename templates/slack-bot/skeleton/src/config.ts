import { z } from "zod";

// ── Config Schema ──────────────────────────────────────────────────
//
// Validates required environment variables at startup. If any value is
// missing or invalid the process logs the specific errors and exits
// immediately — no silent misconfiguration.
//

/** The longest timeout a setting takes: the longest delay a Node.js timer holds. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * LLM_REQUEST_TIMEOUT_MS, the per-call LLM request timeout in milliseconds,
 * at which a hung upstream fails into the provider's circuit breaker: a whole
 * number from 1 to 2147483647, and 30000 when unset or empty.
 */
export const requestTimeoutMs = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === "") return 30_000;
    const ms = /^\d+$/.test(value) ? Number(value) : Number.NaN;
    if (ms >= 1 && ms <= MAX_TIMEOUT_MS) return ms;
    ctx.addIssue({
      code: "custom",
      message: `must be a whole number of milliseconds from 1 to ${MAX_TIMEOUT_MS}, got "${value}"`,
    });
    return z.NEVER;
  });

/**
 * The timeout LLM_REQUEST_TIMEOUT_MS sets, read with the schema loadConfig()
 * validates it by. Every LLM provider reads it as its module loads, so a
 * value the schema refuses fails the import.
 */
export function readRequestTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const parsed = requestTimeoutMs.safeParse(env.LLM_REQUEST_TIMEOUT_MS);
  if (!parsed.success) {
    throw new Error(`LLM_REQUEST_TIMEOUT_MS ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}

const configSchema = z.object({
  SLACK_BOT_TOKEN: z.string().min(1, "SLACK_BOT_TOKEN is required"),

  SLACK_APP_TOKEN: z.string().optional(),

  SLACK_SIGNING_SECRET: z.string().min(1, "SLACK_SIGNING_SECRET is required"),

  LLM_PROVIDER: z.string().default("__LLM_PROVIDER__"),

  // Bedrock model id (Converse) for the bedrock provider. Injectable so the
  // model isn't hardcoded.
  LLM_MODEL: z.string().default("us.anthropic.claude-sonnet-5"),

  // Region where the Bedrock model is enabled, for the bedrock provider. Its
  // auth is the AWS credential chain, never API keys.
  AWS_REGION: z.string().default("us-east-1"),

  LLM_REQUEST_TIMEOUT_MS: requestTimeoutMs,

  PORT: z.string().default("3000").transform(Number).pipe(z.number().int().min(1).max(65535)),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

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
