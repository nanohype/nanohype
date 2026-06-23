import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSource } from '../src/sources/local.js';
import { loadStandard, loadStandards } from '../src/standards.js';
import { NanohypeError } from '../src/errors.js';
import type { Standards } from '../src/types.js';

const CATALOG_ROOT = resolve(import.meta.dirname, '..', '..');

describe('loadStandard', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });

  it('loads language-toolchain and exposes per-language commands', async () => {
    const s = await loadStandard(source, 'language-toolchain');
    expect(s.kind).toBe('nanohype/standards/language-toolchain');
    if (s.kind !== 'nanohype/standards/language-toolchain') throw new Error('kind narrow');
    expect(Object.keys(s.content.toolchains)).toContain('typescript');
    expect(s.content.toolchains.typescript.test).toBe('npm test');
    expect(s.content.toolchains.python.test).toBe('pytest');
  });

  it('loads version-currency with rules and registries', async () => {
    const s = await loadStandard(source, 'version-currency');
    if (s.kind !== 'nanohype/standards/version-currency') throw new Error('kind narrow');
    expect(s.content.rules.length).toBeGreaterThan(0);
    expect(s.content.registries.typescript).toContain('npm');
    expect(s.content.accepted_pin_reasons).toContain('security hold');
  });

  it('loads platform-tenant-contract with required artifacts and do-nots', async () => {
    const s = await loadStandard(source, 'platform-tenant-contract');
    if (s.kind !== 'nanohype/standards/platform-tenant-contract') throw new Error('kind narrow');
    expect(s.content.required_artifacts.length).toBeGreaterThan(0);
    expect(s.content.platform_cr_shape.kind).toBe('Platform');
    expect(s.content.otel_resource_attrs.some((a) => a.name === 'agents.tenant')).toBe(true);
    expect(s.content.do_not.length).toBeGreaterThan(0);
  });

  it('loads llm-policy with Bedrock as primary and Claude as default', async () => {
    const s = await loadStandard(source, 'llm-policy');
    if (s.kind !== 'nanohype/standards/llm-policy') throw new Error('kind narrow');
    expect(s.content.primary_provider).toBe('AWS Bedrock');
    expect(s.content.models.default).toMatch(/^anthropic\.claude-sonnet/);
    expect(s.content.regions_preferred).toContain('us-west-2');
  });

  it('loads quality-rubric-dimensions with nine named dimensions', async () => {
    const s = await loadStandard(source, 'quality-rubric-dimensions');
    if (s.kind !== 'nanohype/standards/quality-rubric-dimensions') throw new Error('kind narrow');
    expect(s.content.dimensions).toHaveLength(9);
    const ids = s.content.dimensions.map((d) => d.id);
    for (const required of [
      'architecture',
      'patterns',
      'systems',
      'testing',
      'frontend',
      'security',
      'code_quality',
      'documentation',
      'consistency',
    ]) {
      expect(ids).toContain(required);
    }
  });

  it('loads testing-rubric with a coverage floor and enforcement rules', async () => {
    const s = await loadStandard(source, 'testing-rubric');
    if (s.kind !== 'nanohype/standards/testing-rubric') throw new Error('kind narrow');
    expect(s.content.coverage_floor.branches).toBeGreaterThanOrEqual(60);
    expect(s.content.coverage_floor.lines).toBeGreaterThanOrEqual(75);
    expect(s.content.rules.length).toBeGreaterThan(0);
    expect(s.content.rules.some((r) => r.id === 'typecheck-includes-tests')).toBe(true);
  });

  it('loads observability-slo with SLI types, burn-rate windows, and dashboard rows', async () => {
    const s = await loadStandard(source, 'observability-slo');
    if (s.kind !== 'nanohype/standards/observability-slo') throw new Error('kind narrow');
    expect(s.content.principles.golden_signals).toEqual(
      expect.arrayContaining(['latency', 'traffic', 'errors', 'saturation']),
    );
    expect(s.content.slo.window_days).toBe(30);
    expect(s.content.slo.sli_types.some((t) => t.id === 'availability')).toBe(true);
    expect(s.content.burn_rate_alerts.windows.some((w) => w.severity === 'page')).toBe(true);
    expect(s.content.dashboard_requirements.required_rows.some((r) => r.id === 'slo')).toBe(true);
  });

  it('throws NanohypeError when the standard is missing', async () => {
    const broken = new LocalSource({ rootDir: '/tmp/nonexistent-nanohype-standards' });
    await expect(loadStandard(broken, 'llm-policy')).rejects.toBeInstanceOf(NanohypeError);
  });
});

describe('loadStandards (bundle)', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });

  it('returns every standard under its canonical name slot', async () => {
    const bundle: Standards = await loadStandards(source);
    expect(bundle['language-toolchain'].kind).toBe('nanohype/standards/language-toolchain');
    expect(bundle['version-currency'].kind).toBe('nanohype/standards/version-currency');
    expect(bundle['platform-tenant-contract'].kind).toBe(
      'nanohype/standards/platform-tenant-contract',
    );
    expect(bundle['llm-policy'].kind).toBe('nanohype/standards/llm-policy');
    expect(bundle['quality-rubric-dimensions'].kind).toBe(
      'nanohype/standards/quality-rubric-dimensions',
    );
    expect(bundle['testing-rubric'].kind).toBe('nanohype/standards/testing-rubric');
    expect(bundle['observability-slo'].kind).toBe('nanohype/standards/observability-slo');
  });
});
