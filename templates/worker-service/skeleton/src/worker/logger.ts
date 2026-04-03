// ── Structured Logger ──────────────────────────────────────────────
//
// Lightweight structured logger that writes JSON to stdout. Each log
// line includes a timestamp, level, component tag, and message. No
// external dependencies — keeps the worker lean.
//

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export interface Logger {
  trace(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  fatal(msg: string, data?: Record<string, unknown>): void;
  child(component: string): Logger;
}

/**
 * Create a structured logger instance. The logger filters messages
 * below the configured minimum level and writes JSON lines to stdout.
 */
export function createLogger(minLevel: LogLevel, component = "worker"): Logger {
  const minOrdinal = LEVEL_ORDER[minLevel];

  function emit(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < minOrdinal) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      component,
      msg,
      ...data,
    };

    const output = JSON.stringify(entry);

    if (LEVEL_ORDER[level] >= LEVEL_ORDER.error) {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }

  return {
    trace: (msg, data) => emit("trace", msg, data),
    debug: (msg, data) => emit("debug", msg, data),
    info: (msg, data) => emit("info", msg, data),
    warn: (msg, data) => emit("warn", msg, data),
    error: (msg, data) => emit("error", msg, data),
    fatal: (msg, data) => emit("fatal", msg, data),
    child: (childComponent) => createLogger(minLevel, `${component}.${childComponent}`),
  };
}
