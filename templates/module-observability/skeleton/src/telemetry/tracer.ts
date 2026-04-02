import { trace, type Tracer, type Span, SpanStatusCode } from "@opentelemetry/api";

/**
 * Tracer wrapper for creating spans.
 *
 * Provides a thin convenience layer over the OpenTelemetry API tracer,
 * handling common patterns like auto-recording exceptions and setting
 * span status on error.
 */

/**
 * Get a named tracer instance. Each logical component of your
 * application should use its own tracer name for attribution.
 */
export function getTracer(name: string, version?: string): Tracer {
  return trace.getTracer(name, version);
}

/**
 * Run an async function inside a new span. The span is automatically
 * ended when the function completes, and errors are recorded on the
 * span before being re-thrown.
 */
export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getTracer(tracerName);

  return tracer.startActiveSpan(spanName, async (span: Span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Run a synchronous function inside a new span.
 */
export function withSpanSync<T>(
  tracerName: string,
  spanName: string,
  fn: (span: Span) => T,
): T {
  const tracer = getTracer(tracerName);

  return tracer.startActiveSpan(spanName, (span: Span) => {
    try {
      const result = fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}
