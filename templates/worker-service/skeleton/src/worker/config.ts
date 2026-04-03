import { z } from "zod";
import type { WorkerConfig } from "./types.js";

// ── Config Schema ─────────────────────────────────────────────────
//
// Validates required environment variables at startup. If any value
// is missing or invalid the process logs the specific errors and
// exits immediately — no silent misconfiguration.
//

const configSchema = z.object({
  HEALTH_PORT: z
    .string()
    .default("9090")
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  QUEUE_PROVIDER: z.string().default("__QUEUE_PROVIDER__"),

  QUEUE_POLL_INTERVAL: z
    .string()
    .default("1000")
    .transform(Number)
    .pipe(z.number().int().min(100)),

  QUEUE_CONCURRENCY: z
    .string()
    .default("5")
    .transform(Number)
    .pipe(z.number().int().min(1).max(100)),

  CRON_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  SHUTDOWN_TIMEOUT: z
    .string()
    .default("30000")
    .transform(Number)
    .pipe(z.number().int().min(1000)),
});

/**
 * Parse and validate environment variables against the config schema.
 * Returns a typed WorkerConfig on success; logs validation errors and
 * terminates the process on failure.
 */
export function loadConfig(): WorkerConfig {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error("[config] Invalid configuration:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const env = result.data;

  return {
    healthPort: env.HEALTH_PORT,
    logLevel: env.LOG_LEVEL,
    queueProvider: env.QUEUE_PROVIDER,
    pollInterval: env.QUEUE_POLL_INTERVAL,
    concurrency: env.QUEUE_CONCURRENCY,
    cronEnabled: env.CRON_ENABLED,
    shutdownTimeout: env.SHUTDOWN_TIMEOUT,
  };
}
