import { trace, context } from "@opentelemetry/api";

/**
 * Structured logger integrated with OpenTelemetry context.
 *
 * Every log entry automatically includes the current trace ID and
 * span ID when available, enabling correlation between logs and
 * traces in your observability backend.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

function getTraceContext(): { traceId?: string; spanId?: string } {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  };
}

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...getTraceContext(),
    ...fields,
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "debug":
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Structured logger that propagates OpenTelemetry trace context.
 *
 * Usage:
 *   logger.info("request handled", { path: "/api/health", durationMs: 12 });
 *
 * Output:
 *   {"timestamp":"...","level":"info","message":"request handled","traceId":"...","spanId":"...","path":"/api/health","durationMs":12}
 */
export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) =>
    emit("debug", message, fields),

  info: (message: string, fields?: Record<string, unknown>) =>
    emit("info", message, fields),

  warn: (message: string, fields?: Record<string, unknown>) =>
    emit("warn", message, fields),

  error: (message: string, fields?: Record<string, unknown>) =>
    emit("error", message, fields),
};
