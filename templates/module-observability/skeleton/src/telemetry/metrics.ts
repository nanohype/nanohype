import { metrics, type Meter, type Counter, type Histogram } from "@opentelemetry/api";

/**
 * Metrics helpers for creating counters and histograms.
 *
 * Uses the OpenTelemetry Metrics API so instruments are automatically
 * exported by whichever metric exporter the SDK is configured with.
 */

/**
 * Get a named meter instance. Each logical component should use its
 * own meter name for attribution.
 */
export function getMeter(name: string, version?: string): Meter {
  return metrics.getMeter(name, version);
}

/**
 * Create a counter metric. Counters are monotonically increasing
 * values — use them for request counts, error counts, etc.
 */
export function createCounter(
  meterName: string,
  name: string,
  options?: { description?: string; unit?: string },
): Counter {
  const meter = getMeter(meterName);
  return meter.createCounter(name, options);
}

/**
 * Create a histogram metric. Histograms record distributions of
 * values — use them for latencies, request sizes, etc.
 */
export function createHistogram(
  meterName: string,
  name: string,
  options?: { description?: string; unit?: string },
): Histogram {
  const meter = getMeter(meterName);
  return meter.createHistogram(name, options);
}
