import { metrics as otelMetrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMetrics } from './metrics.js';

/**
 * A real (in-memory) meter provider so the tests assert the actual series
 * shape — instrument names are a public contract queried by dashboards and
 * PrometheusRules, so "it didn't throw" is not enough.
 */
let exporter: InMemoryMetricExporter;
let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

beforeEach(() => {
  exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 3_600_000 });
  provider = new MeterProvider({ readers: [reader] });
  otelMetrics.setGlobalMeterProvider(provider);
});

afterEach(async () => {
  await provider.shutdown();
  otelMetrics.disable();
});

async function collectedInstruments(): Promise<Map<string, unknown>> {
  await reader.forceFlush();
  const byName = new Map<string, unknown>();
  for (const rm of exporter.getMetrics()) {
    for (const scope of rm.scopeMetrics) {
      for (const metric of scope.metrics) {
        byName.set(metric.descriptor.name, metric);
      }
    }
  }
  return byName;
}

const cfg = { meterName: 'test-service', namespace: 'test_service' };

describe('createMetrics', () => {
  it('namespaces every instrument as <namespace>.<name>', async () => {
    const m = createMetrics(cfg);
    m.counter('crawl.failures');
    m.timing('assembly_duration_ms', 42);

    const instruments = await collectedInstruments();
    expect([...instruments.keys()].sort()).toEqual([
      'test_service.assembly_duration_ms',
      'test_service.crawl.failures',
    ]);
  });

  it('accumulates counter values with attributes', async () => {
    const m = createMetrics(cfg);
    m.counter('tokens', 10, { kind: 'input' });
    m.counter('tokens', 5, { kind: 'input' });
    m.counter('tokens', 7, { kind: 'output' });

    const instruments = await collectedInstruments();
    const metric = instruments.get('test_service.tokens') as {
      dataPoints: { attributes: Record<string, string>; value: number }[];
    };
    const byKind = Object.fromEntries(metric.dataPoints.map((d) => [d.attributes.kind, d.value]));
    expect(byKind).toEqual({ input: 15, output: 7 });
  });

  it('records timings as ms histograms', async () => {
    const m = createMetrics(cfg);
    m.timing('latency', 100);
    m.timing('latency', 300);

    const instruments = await collectedInstruments();
    const metric = instruments.get('test_service.latency') as {
      descriptor: { unit: string };
      dataPoints: { value: { count: number; sum: number } }[];
    };
    expect(metric.descriptor.unit).toBe('ms');
    expect(metric.dataPoints[0]?.value.count).toBe(2);
    expect(metric.dataPoints[0]?.value.sum).toBe(400);
  });

  it('applies explicit bucket boundaries to distributions', async () => {
    const m = createMetrics(cfg);
    const boundaries = [0, 0.5, 1];
    m.distribution('change_score', 0.3, undefined, { boundaries });
    m.distribution('change_score', 0.9, undefined, { boundaries });

    const instruments = await collectedInstruments();
    const metric = instruments.get('test_service.change_score') as {
      descriptor: { unit: string };
      dataPoints: { value: { buckets: { boundaries: number[]; counts: number[] } } }[];
    };
    expect(metric.descriptor.unit).toBe('1');
    expect(metric.dataPoints[0]?.value.buckets.boundaries).toEqual(boundaries);
    // Buckets: (-inf,0], (0,0.5], (0.5,1], (1,+inf) — 0.3 and 0.9 land in the middle two.
    expect(metric.dataPoints[0]?.value.buckets.counts).toEqual([0, 1, 1, 0]);
  });

  it('carries unit and description through instrument options', async () => {
    const m = createMetrics(cfg);
    m.counter('email.sent', 1, undefined, { unit: 'emails', description: 'Newsletter sends' });

    const instruments = await collectedInstruments();
    const metric = instruments.get('test_service.email.sent') as {
      descriptor: { unit: string; description: string };
    };
    expect(metric.descriptor.unit).toBe('emails');
    expect(metric.descriptor.description).toBe('Newsletter sends');
  });

  it('observes the latest value per attribute set on an observable gauge', async () => {
    const m = createMetrics(cfg);
    m.setObservable('circuit_breaker.open', 1, { target: 'slack' });
    m.setObservable('circuit_breaker.open', 1, { target: 'linear' });
    m.setObservable('circuit_breaker.open', 0, { target: 'slack' });

    const instruments = await collectedInstruments();
    const metric = instruments.get('test_service.circuit_breaker.open') as {
      dataPoints: { attributes: Record<string, string>; value: number }[];
    };
    const byTarget = Object.fromEntries(
      metric.dataPoints.map((d) => [d.attributes.target, d.value]),
    );
    expect(byTarget).toEqual({ slack: 0, linear: 1 });
  });

  it('caches instruments per name', () => {
    const m = createMetrics(cfg);
    expect(m.counterInstrument('hits')).toBe(m.counterInstrument('hits'));
    expect(m.histogramInstrument('latency')).toBe(m.histogramInstrument('latency'));
  });

  it('degrades to a no-op without a registered meter provider', async () => {
    await provider.shutdown();
    otelMetrics.disable();
    const m = createMetrics(cfg);
    expect(() => {
      m.counter('anything');
      m.timing('anything', 1);
      m.distribution('anything', 0.5);
      m.setObservable('anything', 1);
    }).not.toThrow();
  });
});
