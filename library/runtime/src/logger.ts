/**
 * Structured JSON-lines logger for tenant services.
 *
 * One line per call: `{level, timestamp, message, trace_id?, span_id?,
 * ...bindings, ...context}`. When an OTel span is active, `trace_id` +
 * `span_id` are stamped automatically so Grafana's Tempo ↔ Loki
 * correlation jump works one-click; without a span (tests, CLI) the
 * fields are simply absent.
 *
 * Call shape is context-first (pino-style): `log.info({ incident_id },
 * 'assembled war room')` or bare `log.info('started')`. `child(bindings)`
 * returns a logger that stamps the bindings on every line — the idiom for
 * threading a correlation id through a request.
 *
 * Stream policy is a config choice, not a hardcode:
 * - `stderr` (default) — everything to stderr, keeping stdout clean for
 *   CLI/display output.
 * - `split` — info/debug to stdout, warn/error to stderr.
 *
 * This is deliberately not a pino replacement. Services whose framework
 * integration is pino-shaped (Fastify's bundled logger,
 * `@opentelemetry/instrumentation-pino`) should keep pino; this module is
 * for services that would otherwise hand-roll exactly this file.
 */

import { trace } from '@opentelemetry/api';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LoggerConfig {
  /** Minimum level. Defaults to `LOG_LEVEL` env when valid, else `info`. */
  level?: LogLevel;
  /** Where lines go. Default `stderr`. */
  stream?: 'stderr' | 'split';
  /** Fields stamped on every line (service name, static context). */
  bindings?: Record<string, unknown>;
}

export interface Logger {
  debug(context: Record<string, unknown> | string, message?: string): void;
  info(context: Record<string, unknown> | string, message?: string): void;
  warn(context: Record<string, unknown> | string, message?: string): void;
  error(context: Record<string, unknown> | string, message?: string): void;
  /** A logger stamping `bindings` on every line, sharing this logger's config. */
  child(bindings: Record<string, unknown>): Logger;
  /** Raise/lower the minimum level at runtime (affects children too). */
  setLevel(level: LogLevel): void;
}

function envLevel(): LogLevel {
  const level = process.env['LOG_LEVEL'] as LogLevel | undefined;
  return level && LEVELS[level] !== undefined ? level : 'info';
}

function traceFields(): { trace_id?: string; span_id?: string } {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  if (!ctx.traceId || ctx.traceId === '00000000000000000000000000000000') return {};
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}

export function createLogger(cfg: LoggerConfig = {}): Logger {
  // Shared, mutable level state: setLevel on any child adjusts the whole
  // logger tree, matching how a LOG_LEVEL change is expected to behave.
  const state = { level: cfg.level ?? envLevel() };
  const stream = cfg.stream ?? 'stderr';

  function write(
    level: LogLevel,
    bindings: Record<string, unknown>,
    context: Record<string, unknown> | string,
    message?: string,
  ): void {
    if (LEVELS[level] < LEVELS[state.level]) return;

    const contextFields = typeof context === 'string' ? {} : context;
    const entry = {
      level,
      timestamp: new Date().toISOString(),
      message: typeof context === 'string' ? context : (message ?? ''),
      ...traceFields(),
      ...bindings,
      ...contextFields,
    };

    const line = JSON.stringify(entry) + '\n';
    if (stream === 'split' && (level === 'debug' || level === 'info')) {
      process.stdout.write(line);
    } else {
      process.stderr.write(line);
    }
  }

  function make(bindings: Record<string, unknown>): Logger {
    return {
      debug: (context, message) => write('debug', bindings, context, message),
      info: (context, message) => write('info', bindings, context, message),
      warn: (context, message) => write('warn', bindings, context, message),
      error: (context, message) => write('error', bindings, context, message),
      child: (childBindings) => make({ ...bindings, ...childBindings }),
      setLevel: (level) => {
        state.level = level;
      },
    };
  }

  return make(cfg.bindings ?? {});
}

/** Normalize an unknown thrown value to a string message for log fields. */
export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
