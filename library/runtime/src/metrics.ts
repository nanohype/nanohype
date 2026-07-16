/**
 * OTel metrics surface for tenant services.
 *
 * Every consumer needs the same core: instruments created lazily (so the
 * meter provider — installed by the auto-instrumentations preload — has a
 * chance to register first), cached per name, and self-prefixed with the
 * service namespace so the Prometheus series are deterministic. An
 * instrument named `crawl.failures` under namespace
 * `competitive_intelligence` arrives in AMP/Mimir as
 * `competitive_intelligence_crawl_failures_total` purely from the
 * instrument name (OTLP→Prometheus lowercases dots/dashes to underscores
 * and adds the type suffix), with no collector-side namespace rewrite.
 *
 * `createMetrics` returns that core once; apps keep their own thin,
 * named-wrapper modules over it. Instrument names are a public contract —
 * dashboards and PrometheusRules query the resulting series — so wrappers
 * must preserve their existing names when adopting this module.
 *
 * When no meter provider is registered (tests, CI, `OTEL_SDK_DISABLED`),
 * the OTel API degrades to a no-op. Nothing here throws without a
 * backend, so call sites stay unconditional.
 */

import {
  type Attributes,
  type Counter,
  type Histogram,
  type ObservableGauge,
  type ObservableResult,
  metrics as otelMetrics,
} from "@opentelemetry/api";

export interface InstrumentOptions {
  /** OTel unit string (`ms`, `tokens`, `1`, …). Applied on first creation. */
  unit?: string;
  /** Human description shown by metric browsers. Applied on first creation. */
  description?: string;
  /**
   * Explicit histogram bucket edges. Required for 0–1 ratios, which
   * otherwise inherit OTel's default ms-scale buckets ([0,5,…]) and
   * collapse every value into the first bucket. Applied on first creation.
   */
  boundaries?: number[];
}

export interface Metrics {
  /** Add to a monotonic counter. */
  counter(name: string, value?: number, attributes?: Attributes, opts?: InstrumentOptions): void;
  /** Record a duration in milliseconds (histogram, unit `ms`). */
  timing(name: string, ms: number, attributes?: Attributes): void;
  /** Record a unitless value into a histogram (unit `1` unless overridden). */
  distribution(
    name: string,
    value: number,
    attributes?: Attributes,
    opts?: InstrumentOptions,
  ): void;
  /**
   * Set the current value of an observable gauge for one attribute set.
   * The gauge reports every recorded attribute set on each scrape — the
   * shape breaker-state (1/0 by `target`) and similar current-state
   * signals need.
   */
  setObservable(name: string, value: number, attributes?: Attributes): void;
  /** The cached raw counter instrument, for call sites that record directly. */
  counterInstrument(name: string, opts?: InstrumentOptions): Counter;
  /** The cached raw histogram instrument, for call sites that record directly. */
  histogramInstrument(name: string, opts?: InstrumentOptions): Histogram;
}

export interface MetricsConfig {
  /** OTel meter name — conventionally the service handle (`incident-response`). */
  meterName: string;
  /**
   * Series prefix, prepended as `<namespace>.<name>` on every instrument
   * (`incident_response`). Underscored form of the service handle.
   */
  namespace: string;
}

export function createMetrics(cfg: MetricsConfig): Metrics {
  const qualify = (name: string): string => `${cfg.namespace}.${name}`;
  const meter = () => otelMetrics.getMeter(cfg.meterName);

  const counters = new Map<string, Counter>();
  const histograms = new Map<string, Histogram>();
  const observables = new Map<string, Map<string, { value: number; attributes: Attributes }>>();
  const observableGauges = new Map<string, ObservableGauge>();

  function counterInstrument(name: string, opts?: InstrumentOptions): Counter {
    let c = counters.get(name);
    if (!c) {
      c = meter().createCounter(qualify(name), {
        ...(opts?.unit !== undefined && { unit: opts.unit }),
        ...(opts?.description !== undefined && { description: opts.description }),
      });
      counters.set(name, c);
    }
    return c;
  }

  function histogramInstrument(name: string, opts?: InstrumentOptions): Histogram {
    let h = histograms.get(name);
    if (!h) {
      h = meter().createHistogram(qualify(name), {
        ...(opts?.unit !== undefined && { unit: opts.unit }),
        ...(opts?.description !== undefined && { description: opts.description }),
        ...(opts?.boundaries !== undefined && {
          advice: { explicitBucketBoundaries: opts.boundaries },
        }),
      });
      histograms.set(name, h);
    }
    return h;
  }

  return {
    counter(name, value = 1, attributes, opts): void {
      counterInstrument(name, opts).add(value, attributes);
    },

    timing(name, ms, attributes): void {
      histogramInstrument(name, { unit: "ms" }).record(ms, attributes);
    },

    distribution(name, value, attributes, opts): void {
      histogramInstrument(name, { unit: "1", ...opts }).record(value, attributes);
    },

    setObservable(name, value, attributes = {}): void {
      let entries = observables.get(name);
      if (!entries) {
        entries = new Map();
        observables.set(name, entries);
      }
      entries.set(JSON.stringify(attributes), { value, attributes });

      if (!observableGauges.has(name)) {
        const gauge = meter().createObservableGauge(qualify(name));
        gauge.addCallback((result: ObservableResult) => {
          for (const { value: v, attributes: attrs } of observables.get(name)?.values() ?? []) {
            result.observe(v, attrs);
          }
        });
        observableGauges.set(name, gauge);
      }
    },

    counterInstrument,
    histogramInstrument,
  };
}
