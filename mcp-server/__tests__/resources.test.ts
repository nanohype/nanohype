import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSource, KNOWN_CONTRACT_REPOS, STANDARD_NAMES } from '@nanohype/sdk';
import { listResources, readResource } from '../src/resources.js';

const CATALOG_ROOT = resolve(import.meta.dirname, '..', '..');

// Contract resolution reads sibling repos' AGENTS.md (../<repo>/AGENTS.md), which
// aren't checked out in CI. Point those tests at a self-contained fixture tree so
// they're hermetic; the catalog/template/standard tests still use the real repo.
const CONTRACTS_ROOT = resolve(import.meta.dirname, 'fixtures', 'contracts', 'nanohype');

describe('listResources', () => {
  it('advertises catalog, standards bundle, every standard, every contract', () => {
    const resources = listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain('nanohype://catalog');
    expect(uris).toContain('nanohype://standards');
    // Assert against the SDK's canonical lists so the advertised surface never
    // drifts as the standards or contract surfaces change.
    for (const name of STANDARD_NAMES) {
      expect(uris).toContain(`nanohype://standards/${name}`);
    }
    for (const repo of KNOWN_CONTRACT_REPOS) {
      expect(uris).toContain(`nanohype://contracts/${repo}`);
    }
    expect(uris).not.toContain('nanohype://contracts/aks-gitops');
  });

  it('every resource carries a name, description, and mimeType', () => {
    for (const r of listResources()) {
      expect(r.name).toBeTruthy();
      expect(r.description.length).toBeGreaterThan(10);
      expect(['application/json', 'text/markdown']).toContain(r.mimeType);
    }
  });
});

describe('readResource', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });
  const contractSource = new LocalSource({ rootDir: CONTRACTS_ROOT });

  it('resolves nanohype://catalog to the parsed catalog JSON', async () => {
    const result = await readResource(source, 'nanohype://catalog');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe('application/json');
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.kind).toBe('nanohype/catalog');
    expect(parsed.templates.length).toBeGreaterThan(0);
  });

  it('resolves nanohype://standards to the full standards bundle', async () => {
    const result = await readResource(source, 'nanohype://standards');
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed['language-toolchain'].kind).toBe('nanohype/standards/language-toolchain');
    expect(parsed['quality-rubric-dimensions'].content.dimensions).toHaveLength(9);
  });

  it('resolves nanohype://standards/{name} to one standard', async () => {
    const result = await readResource(source, 'nanohype://standards/llm-policy');
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.kind).toBe('nanohype/standards/llm-policy');
    expect(parsed.content.primary_provider).toBe('AWS Bedrock');
  });

  it('resolves nanohype://contracts/{repo} to the AGENTS.md content', async () => {
    const result = await readResource(contractSource, 'nanohype://contracts/landing-zone');
    expect(result.contents[0].mimeType).toBe('text/markdown');
    expect(result.contents[0].text).toContain('# landing-zone');
  });

  it('resolves nanohype://template/{name} to a template manifest', async () => {
    const result = await readResource(source, 'nanohype://template/agentic-loop');
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.name).toBe('agentic-loop');
    expect(parsed.apiVersion).toBe('nanohype/v1');
  });

  it('resolves nanohype://composite/{name} to a composite manifest', async () => {
    const result = await readResource(source, 'nanohype://composite/agent-team');
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.name).toBe('agent-team');
    expect(parsed.kind).toBe('composite');
  });

  it('rejects unknown standards', async () => {
    await expect(readResource(source, 'nanohype://standards/nonsense')).rejects.toThrow(
      /Unknown standard/,
    );
  });

  it('rejects unknown contract repos', async () => {
    await expect(readResource(source, 'nanohype://contracts/nonsense')).rejects.toThrow(
      /Unknown repo/,
    );
  });

  it('rejects unrecognized URI shapes', async () => {
    await expect(readResource(source, 'nanohype://unknown/thing')).rejects.toThrow(
      /Unrecognized resource URI/,
    );
  });

  it('rejects template names that violate the catalog naming rule', async () => {
    await expect(readResource(source, 'nanohype://template/../../etc/passwd')).rejects.toThrow(
      /Invalid template name/,
    );
    await expect(readResource(source, 'nanohype://template/go-cli\0evil')).rejects.toThrow(
      /Invalid template name/,
    );
  });

  it('rejects composite names that violate the catalog naming rule', async () => {
    await expect(readResource(source, 'nanohype://composite/../secrets')).rejects.toThrow(
      /Invalid composite name/,
    );
  });

  it('rejects traversal in standard and contract URIs', async () => {
    await expect(readResource(source, 'nanohype://standards/../package')).rejects.toThrow(
      /Unknown standard/,
    );
    await expect(readResource(source, 'nanohype://contracts/../../etc')).rejects.toThrow(
      /Unknown repo/,
    );
  });
});
