import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSource, type CatalogTemplate } from '@nanohype/sdk';
import { callTool, listTools, searchTemplates } from '../src/tools.js';

const CATALOG_ROOT = resolve(import.meta.dirname, '..', '..');

// get_contract reads sibling repos' AGENTS.md (../<repo>/AGENTS.md), which aren't
// checked out in CI. Point those tests at a self-contained fixture tree so they're
// hermetic; the other tools still dispatch against the real catalog.
const CONTRACTS_ROOT = resolve(import.meta.dirname, 'fixtures', 'contracts', 'nanohype');

describe('listTools', () => {
  it('advertises the canonical tool set', () => {
    const names = listTools().map((t) => t.name);
    expect(names).toEqual([
      'search_templates',
      'get_template',
      'get_composite',
      'list_standards',
      'get_standard',
      'get_contract',
    ]);
  });

  it('every tool has a non-empty description and JSON-schema input', () => {
    for (const t of listTools()) {
      expect(t.description.length).toBeGreaterThan(20);
      expect((t.inputSchema as Record<string, unknown>).type).toBe('object');
    }
  });
});

describe('searchTemplates (pure)', () => {
  const fixtures: CatalogTemplate[] = [
    {
      name: 'agentic-loop',
      displayName: 'Agentic Loop',
      description: 'Autonomous agent with tool registry',
      version: '0.1.0',
      category: 'ai-systems',
      persona: ['engineering'],
      tags: ['typescript', 'agent', 'llm'],
      kind: 'template',
      path: 'templates/agentic-loop',
    },
    {
      name: 'go-cli',
      displayName: 'Go CLI',
      description: 'Go command-line application skeleton',
      version: '0.1.0',
      category: 'applications',
      persona: ['engineering'],
      tags: ['go', 'cli'],
      kind: 'template',
      path: 'templates/go-cli',
    },
    {
      name: 'brief-prd',
      displayName: 'Product Brief',
      description: 'Brief for product management',
      version: '0.1.0',
      category: 'product',
      persona: ['product'],
      tags: ['product'],
      kind: 'brief',
      path: 'templates/brief-prd',
    },
  ];

  it('matches against name + displayName + description + tags (case-insensitive)', () => {
    expect(searchTemplates(fixtures, { query: 'AGENT' })).toHaveLength(1);
    expect(searchTemplates(fixtures, { query: 'cli' })).toHaveLength(1);
    expect(searchTemplates(fixtures, { query: 'product' })).toHaveLength(1);
  });

  it('empty query returns everything', () => {
    expect(searchTemplates(fixtures, { query: '' })).toHaveLength(3);
  });

  it('filters by category', () => {
    expect(searchTemplates(fixtures, { query: '', category: 'ai-systems' })).toHaveLength(1);
  });

  it('filters by persona', () => {
    expect(searchTemplates(fixtures, { query: '', persona: 'product' })).toHaveLength(1);
  });

  it('filters by kind', () => {
    expect(searchTemplates(fixtures, { query: '', kind: 'brief' })).toHaveLength(1);
    expect(searchTemplates(fixtures, { query: '', kind: 'template' })).toHaveLength(2);
  });

  it('composes filters (AND semantics)', () => {
    expect(
      searchTemplates(fixtures, { query: '', category: 'ai-systems', kind: 'template' }),
    ).toHaveLength(1);
    expect(
      searchTemplates(fixtures, { query: '', category: 'ai-systems', kind: 'brief' }),
    ).toHaveLength(0);
  });
});

describe('callTool', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });
  const contractSource = new LocalSource({ rootDir: CONTRACTS_ROOT });

  it('search_templates dispatches to the real catalog', async () => {
    const result = await callTool(source, 'search_templates', { query: 'mcp' });
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((t: CatalogTemplate) => t.name === 'mcp-server-ts')).toBe(true);
  });

  it('get_template returns the manifest', async () => {
    const result = await callTool(source, 'get_template', { name: 'agentic-loop' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe('agentic-loop');
  });

  it('get_composite returns the manifest', async () => {
    const result = await callTool(source, 'get_composite', { name: 'agent-team' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.kind).toBe('composite');
  });

  it('list_standards returns the canonical names', async () => {
    const result = await callTool(source, 'list_standards', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toContain('llm-policy');
    expect(parsed).toContain('language-toolchain');
  });

  it('get_standard returns the parsed standard', async () => {
    const result = await callTool(source, 'get_standard', { name: 'llm-policy' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.kind).toBe('nanohype/standards/llm-policy');
  });

  it('get_contract returns the markdown content', async () => {
    const result = await callTool(contractSource, 'get_contract', { repo: 'kx' });
    expect(result.content[0].text).toContain('# kx');
  });

  it('get_contract resolves cloudgov', async () => {
    const result = await callTool(contractSource, 'get_contract', { repo: 'cloudgov' });
    expect(result.content[0].text).toContain('# cloudgov');
  });

  it('rejects unknown tools', async () => {
    await expect(callTool(source, 'bogus_tool', {})).rejects.toThrow(/Unknown tool/);
  });
});
