import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSource } from '../../src/sources/local.js';

// Point at the real nanohype catalog (sibling to sdk/)
const CATALOG_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('LocalSource', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });

  describe('listTemplates', () => {
    it('discovers templates from the real catalog', async () => {
      const entries = await source.listTemplates();
      expect(entries.length).toBeGreaterThan(0);
      const names = entries.map((e) => e.name);
      expect(names).toContain('go-cli');
      expect(names).toContain('agentic-loop');
    });

    it('returns well-formed catalog entries', async () => {
      const entries = await source.listTemplates();
      for (const entry of entries) {
        expect(entry.name).toBeTruthy();
        expect(entry.displayName).toBeTruthy();
        expect(entry.description).toBeTruthy();
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(entry.tags.length).toBeGreaterThan(0);
      }
    });

    it('returns empty array for nonexistent directory', async () => {
      const s = new LocalSource({ rootDir: '/tmp/nonexistent-nanohype' });
      const entries = await s.listTemplates();
      expect(entries).toEqual([]);
    });
  });

  describe('fetchTemplate', () => {
    it('fetches a real template with manifest and files', async () => {
      const { manifest, files } = await source.fetchTemplate('go-cli');
      expect(manifest.name).toBe('go-cli');
      expect(manifest.apiVersion).toBe('nanohype/v1');
      expect(files.length).toBeGreaterThan(0);
      // Skeleton paths should be relative (no templates/go-cli/skeleton/ prefix)
      for (const file of files) {
        expect(file.path).not.toContain('skeleton/');
        expect(file.content).toBeTruthy();
      }
    });

    it('throws on missing template', async () => {
      await expect(source.fetchTemplate('nonexistent-template')).rejects.toThrow(
        "Template 'nonexistent-template' not found",
      );
    });
  });

  describe('listComposites', () => {
    it('discovers composites from the real catalog', async () => {
      const entries = await source.listComposites();
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.name).toBeTruthy();
        expect(entry.templateCount).toBeGreaterThan(0);
      }
    });
  });

  describe('fetchComposite', () => {
    it('fetches a real composite manifest', async () => {
      const composites = await source.listComposites();
      expect(composites.length).toBeGreaterThan(0);

      const manifest = await source.fetchComposite(composites[0].name);
      expect(manifest.apiVersion).toBe('nanohype/v1');
      expect(manifest.kind).toBe('composite');
      expect(manifest.templates.length).toBeGreaterThan(0);
    });

    it('throws on missing composite', async () => {
      await expect(source.fetchComposite('nonexistent-composite')).rejects.toThrow(
        "Composite 'nonexistent-composite' not found",
      );
    });
  });
});
