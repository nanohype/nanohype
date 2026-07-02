import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSource, KNOWN_CONTRACT_REPOS, type CatalogTemplate } from '@nanohype/sdk';
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

  it('get_contract enum reflects the current contract surface', () => {
    const tool = listTools().find((t) => t.name === 'get_contract')!;
    const repoEnum = (tool.inputSchema.properties as { repo: { enum: string[] } }).repo.enum;
    expect(repoEnum).toEqual([...KNOWN_CONTRACT_REPOS]);
    expect(repoEnum).not.toContain('aks-gitops');
    expect(repoEnum).toEqual(expect.arrayContaining(['fab', 'portal', 'eks-fleet']));
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

  it('get_contract resolves fab (newly added repo)', async () => {
    const result = await callTool(contractSource, 'get_contract', { repo: 'fab' });
    expect(result.content[0].text).toContain('# fab');
  });

  it('rejects unknown tools as a protocol error (throw, not isError result)', async () => {
    await expect(callTool(source, 'bogus_tool', {})).rejects.toThrow(/Unknown tool/);
  });

  it('happy-path results carry no isError flag', async () => {
    const result = await callTool(source, 'get_template', { name: 'agentic-loop' });
    expect(result.isError).toBeUndefined();
  });
});

describe('callTool argument validation', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });

  async function expectToolError(
    name: string,
    args: Record<string, unknown>,
    match: string | RegExp,
  ): Promise<void> {
    const result = await callTool(source, name, args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(match);
  }

  describe('get_template / get_composite names', () => {
    it('rejects path traversal', async () => {
      await expectToolError(
        'get_template',
        { name: '../../../etc/passwd' },
        /not a valid catalog name/,
      );
      await expectToolError('get_composite', { name: '../secrets' }, /not a valid catalog name/);
    });

    it('rejects absolute paths', async () => {
      await expectToolError('get_template', { name: '/etc/passwd' }, /not a valid catalog name/);
    });

    it('rejects null bytes', async () => {
      await expectToolError('get_template', { name: 'go-cli\0evil' }, /not a valid catalog name/);
    });

    it('rejects URL metacharacters', async () => {
      await expectToolError(
        'get_template',
        { name: 'go-cli?ref=evil' },
        /not a valid catalog name/,
      );
      await expectToolError('get_composite', { name: 'a/b' }, /not a valid catalog name/);
    });

    it('rejects missing and non-string names', async () => {
      await expectToolError('get_template', {}, /'name': expected a string, got undefined/);
      await expectToolError('get_template', { name: 42 }, /'name': expected a string/);
      await expectToolError('get_composite', { name: null }, /'name': expected a string/);
    });
  });

  describe('get_standard names', () => {
    it('rejects names outside the published set', async () => {
      await expectToolError('get_standard', { name: 'bogus' }, /not a known standard/);
    });

    it('rejects traversal attempts', async () => {
      await expectToolError('get_standard', { name: '../../package' }, /not a known standard/);
    });

    it('rejects non-string names', async () => {
      await expectToolError('get_standard', { name: 42 }, /'name': expected a string/);
    });
  });

  describe('get_contract repos', () => {
    it('rejects repos outside the known set', async () => {
      await expectToolError('get_contract', { repo: 'not-a-repo' }, /not a known contract repo/);
    });

    it('rejects traversal attempts', async () => {
      await expectToolError('get_contract', { repo: '../../etc' }, /not a known contract repo/);
      await expectToolError(
        'get_contract',
        { repo: 'nanohype/../evil' },
        /not a known contract repo/,
      );
    });

    it('rejects missing repos', async () => {
      await expectToolError('get_contract', {}, /'repo': expected a string, got undefined/);
    });
  });

  describe('search_templates filters', () => {
    it('rejects a missing query (declared required)', async () => {
      await expectToolError('search_templates', {}, /'query': expected a string, got undefined/);
    });

    it('rejects non-string filters', async () => {
      await expectToolError(
        'search_templates',
        { query: '', category: 3 },
        /'category': expected a string/,
      );
      await expectToolError(
        'search_templates',
        { query: '', persona: {} },
        /'persona': expected a string/,
      );
    });

    it('rejects kind values outside the enum', async () => {
      await expectToolError(
        'search_templates',
        { query: '', kind: 'bogus' },
        /'kind'.*expected 'template' or 'brief'/,
      );
    });

    it('still accepts the full valid filter set', async () => {
      const result = await callTool(source, 'search_templates', {
        query: '',
        category: 'ai-systems',
        persona: 'engineering',
        kind: 'template',
      });
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text).length).toBeGreaterThan(0);
    });
  });
});

describe('callTool error semantics', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });

  it('a well-formed but missing template is an isError result, not a throw', async () => {
    const result = await callTool(source, 'get_template', { name: 'no-such-template' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Template 'no-such-template' not found");
  });

  it('a well-formed but missing composite is an isError result, not a throw', async () => {
    const result = await callTool(source, 'get_composite', { name: 'no-such-composite' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Composite 'no-such-composite' not found");
  });
});
