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

  describe('path containment', () => {
    it('rejects template names that traverse out of templates/', async () => {
      await expect(source.fetchTemplate('../sdk')).rejects.toThrow(/escapes/);
    });

    it('rejects template names that traverse to a sibling catalog directory', async () => {
      await expect(source.fetchTemplate('../composites')).rejects.toThrow(/escapes/);
    });

    it('rejects absolute template names', async () => {
      await expect(source.fetchTemplate('/etc/passwd')).rejects.toThrow(/escapes/);
    });

    it('rejects template names containing null bytes', async () => {
      await expect(source.fetchTemplate('go-cli\0evil')).rejects.toThrow(/null byte/);
    });

    it('rejects composite names that traverse out of composites/', async () => {
      await expect(source.fetchComposite('../../outside/secret')).rejects.toThrow(/escapes/);
    });

    it('rejects standard names that traverse out of standards/', async () => {
      await expect(
        source.fetchStandard('../package' as Parameters<typeof source.fetchStandard>[0]),
      ).rejects.toThrow(/escapes/);
    });

    it('rejects contract repo names that traverse out of the workspace parent', async () => {
      await expect(
        source.fetchContract('../../etc' as Parameters<typeof source.fetchContract>[0]),
      ).rejects.toThrow(/escapes/);
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
