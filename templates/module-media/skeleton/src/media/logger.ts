// ── Logger ──────────────────────────────────────────────────────────
//
// Lightweight structured logger. Reads LOG_LEVEL from the environment.
// Outputs JSON lines for machine consumption.
//

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function currentLevel(): number {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[env] ?? LEVELS.info;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel()) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module: "media",
    message,
    ...data,
  };
  const out = level === "error" ? console.error : console.log;
  out(JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
};
