// ── Billing Logger ─────────────────────────────────────────────────
//
// Thin structured-logging wrapper. Writes JSON to stdout/stderr.
// Respects LOG_LEVEL env var (debug, info, warn, error). Defaults
// to "info" in production, "debug" otherwise.
//

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function currentLevel(): number {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
  return LEVELS[env] ?? LEVELS.info;
}

function emit(level: Level, message: string, data?: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel()) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    module: "billing",
    msg: message,
    ...data,
  };

  const out = level === "error" ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => emit("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => emit("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit("error", msg, data),
};
