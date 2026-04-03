// ── Logger ──────────────────────────────────────────────────────────
//
// Minimal structured logger. Writes JSON lines to stderr so stdout
// stays clean for machine-readable output (eval results, markdown).
//

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * Create a structured logger that writes JSON lines to stderr.
 */
export function createLogger(level: LogLevel = "info"): Logger {
  const threshold = LEVEL_ORDER[level];

  function write(
    lvl: LogLevel,
    msg: string,
    data?: Record<string, unknown>,
  ): void {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const entry = {
      level: lvl,
      msg,
      ts: new Date().toISOString(),
      ...data,
    };
    process.stderr.write(JSON.stringify(entry) + "\n");
  }

  return {
    debug: (msg, data) => write("debug", msg, data),
    info: (msg, data) => write("info", msg, data),
    warn: (msg, data) => write("warn", msg, data),
    error: (msg, data) => write("error", msg, data),
  };
}
