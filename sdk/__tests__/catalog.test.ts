import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSource } from '../src/sources/local.js';
import { loadCatalog } from '../src/catalog.js';
import { NanohypeError } from '../src/errors.js';

const CATALOG_ROOT = resolve(import.meta.dirname, '..', '..');

describe('loadCatalog', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });

  it('parses catalog.json from the real catalog', async () => {
    const catalog = await loadCatalog(source);
    expect(catalog.kind).toBe('nanohype/catalog');
    expect(catalog.version).toBe('1');
    expect(catalog.templates.length).toBeGreaterThan(0);
    expect(catalog.composites.length).toBeGreaterThan(0);
  });

  it('returns templates with the expected shape', async () => {
    const catalog = await loadCatalog(source);
    for (const t of catalog.templates) {
      expect(t.name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(t.path).toMatch(/^templates\//);
      expect(['template', 'brief']).toContain(t.kind);
      expect(t.version).toBeTruthy();
    }
  });

  it('returns composites with the expected shape', async () => {
    const catalog = await loadCatalog(source);
    for (const c of catalog.composites) {
      expect(c.name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(c.path).toMatch(/^composites\/[a-z][a-z0-9-]*\.yaml$/);
    }
  });

  it('throws NanohypeError when catalog.json is missing', async () => {
    const broken = new LocalSource({ rootDir: '/tmp/nonexistent-nanohype-catalog' });
    await expect(loadCatalog(broken)).rejects.toBeInstanceOf(NanohypeError);
  });
});
