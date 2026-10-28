// ── Billing Logger ─────────────────────────────────────────────────
//
// Thin structured-logging wrapper. Writes JSON to stdout/stderr.
// Respects the LOG_LEVEL env var (debug, info, warn, error, silent),
// read on every call. Unset or unrecognized, the level is "info";
// "silent" writes nothing.
//

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level | "silent", number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function currentLevel(): number {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return Object.hasOwn(LEVELS, env) ? LEVELS[env as keyof typeof LEVELS] : LEVELS.info;
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
  out.write(`${JSON.stringify(entry)}\n`);
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => emit("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => emit("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit("error", msg, data),
};
