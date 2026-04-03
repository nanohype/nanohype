// ── Structured Logger ───────────────────────────────────────────────
//
// Minimal structured JSON logger for the gateway. Outputs one JSON
// line per log entry in production, compact single-line in development.
// No external dependencies — uses console directly.
//

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/**
 * Create a logger instance scoped to a component name.
 * Log entries below the configured level are discarded.
 */
export function createLogger(component: string, level: LogLevel = "info"): Logger {
  const minLevel = LEVEL_ORDER[level];
  const isProd = process.env.NODE_ENV === "production";

  function emit(lvl: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[lvl] < minLevel) return;

    if (isProd) {
      const entry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level: lvl,
        component,
        message,
        ...fields,
      };
      console.log(JSON.stringify(entry));
    } else {
      const extra = fields ? ` ${JSON.stringify(fields)}` : "";
      console.log(`[${component}] ${lvl.toUpperCase()} ${message}${extra}`);
    }
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}
