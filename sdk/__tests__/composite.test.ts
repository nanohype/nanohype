import { describe, expect, it } from 'vitest';
import { renderComposite } from '../src/composite.js';
import type {
  CatalogEntry,
  CompositeCatalogEntry,
  CompositeManifest,
  SkeletonFile,
  TemplateManifest,
} from '../src/types.js';
import type { CatalogSource } from '../src/source.js';

function mockTemplate(
  name: string,
  variables: TemplateManifest['variables'] = [],
  files: SkeletonFile[] = [],
): { manifest: TemplateManifest; files: SkeletonFile[] } {
  return {
    manifest: {
      apiVersion: 'nanohype/v1',
      name,
      displayName: name,
      description: name,
      version: '0.1.0',
      tags: ['test'],
      variables,
    },
    files,
  };
}

function mockSource(
  templates: Record<string, ReturnType<typeof mockTemplate>>,
): CatalogSource {
  return {
    async listTemplates(): Promise<CatalogEntry[]> {
      return Object.keys(templates).map((name) => ({
        name,
        displayName: name,
        description: name,
        version: '0.1.0',
        tags: ['test'],
      }));
    },
    async fetchTemplate(name: string) {
      const t = templates[name];
      if (!t) throw new Error(`Template '${name}' not found`);
      return t;
    },
    async listComposites(): Promise<CompositeCatalogEntry[]> {
      return [];
    },
    async fetchComposite(): Promise<CompositeManifest> {
      throw new Error('Not implemented');
    },
  };
}

describe('renderComposite', () => {
  it('renders a single root entry at output root', async () => {
    const source = mockSource({
      'my-template': mockTemplate('my-template', [], [
        { path: 'README.md', content: 'hello' },
      ]),
    });
    const manifest: CompositeManifest = {
      apiVersion: 'nanohype/v1',
      kind: 'composite',
      name: 'test',
      displayName: 'Test',
      description: 'Test',
      version: '0.1.0',
      tags: ['test'],
      variables: [],
      templates: [{ template: 'my-template', root: true }],
    };

    const result = await renderComposite(manifest, {}, source);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('README.md');
  });

  it('prefixes non-root entry paths', async () => {
    const source = mockSource({
      root: mockTemplate('root', [], [{ path: 'package.json', content: '{}' }]),
      child: mockTemplate('child', [], [{ path: 'index.ts', content: 'main' }]),
    });
    const manifest: CompositeManifest = {
      apiVersion: 'nanohype/v1',
      kind: 'composite',
      name: 'test',
      displayName: 'Test',
      description: 'Test',
      version: '0.1.0',
      tags: ['test'],
      variables: [],
      templates: [
        { template: 'root', root: true },
        { template: 'child', path: 'packages/child' },
      ],
    };

    const result = await renderComposite(manifest, {}, source);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe('package.json');
    expect(result.files[1].path).toBe('packages/child/index.ts');
  });

  it('processes root entry first regardless of array order', async () => {
    const source = mockSource({
      root: mockTemplate('root', [], [{ path: 'root.txt', content: 'root' }]),
      child: mockTemplate('child', [], [{ path: 'child.txt', content: 'child' }]),
    });
    const manifest: CompositeManifest = {
      apiVersion: 'nanohype/v1',
      kind: 'composite',
      name: 'test',
      displayName: 'Test',
      description: 'Test',
      version: '0.1.0',
      tags: ['test'],
      variables: [],
      templates: [
        { template: 'child', path: 'packages/child' },
        { template: 'root', root: true },
      ],
    };

    const result = await renderComposite(manifest, {}, source);
    expect(result.entries[0].template).toBe('root');
    expect(result.entries[1].template).toBe('child');
  });

  it('skips entries whose condition is false', async () => {
    const source = mockSource({
      always: mockTemplate('always', [], [{ path: 'a.txt', content: 'a' }]),
      optional: mockTemplate('optional', [], [{ path: 'b.txt', content: 'b' }]),
    });
    const manifest: CompositeManifest = {
      apiVersion: 'nanohype/v1',
      kind: 'composite',
      name: 'test',
      displayName: 'Test',
      description: 'Test',
      version: '0.1.0',
      tags: ['test'],
      variables: [
        { name: 'IncludeOptional', type: 'bool', placeholder: '__INCLUDE__', description: 'Include' },
      ],
      templates: [
        { template: 'always' },
        { template: 'optional', path: 'opt', condition: 'IncludeOptional' },
      ],
    };

    const result = await renderComposite(manifest, { IncludeOptional: false }, source);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('a.txt');
    expect(result.entries).toHaveLength(1);
  });

  it('expands ${VarName} in entry variable overrides', async () => {
    const source = mockSource({
      tmpl: mockTemplate(
        'tmpl',
        [{ name: 'ProjectName', type: 'string', placeholder: '__PROJECT_NAME__', description: 'Name' }],
        [{ path: 'README.md', content: '# __PROJECT_NAME__' }],
      ),
    });
    const manifest: CompositeManifest = {
      apiVersion: 'nanohype/v1',
      kind: 'composite',
      name: 'test',
      displayName: 'Test',
      description: 'Test',
      version: '0.1.0',
      tags: ['test'],
      variables: [
        { name: 'Name', type: 'string', placeholder: '__NAME__', description: 'Name' },
      ],
      templates: [
        { template: 'tmpl', root: true, variables: { ProjectName: '${Name}' } },
      ],
    };

    const result = await renderComposite(manifest, { Name: 'my-project' }, source);
    expect(result.files[0].content).toBe('# my-project');
  });

  it('warns on file collisions (last-writer-wins)', async () => {
    const source = mockSource({
      first: mockTemplate('first', [], [{ path: 'README.md', content: 'first' }]),
      second: mockTemplate('second', [], [{ path: 'README.md', content: 'second' }]),
    });
    const manifest: CompositeManifest = {
      apiVersion: 'nanohype/v1',
      kind: 'composite',
      name: 'test',
      displayName: 'Test',
      description: 'Test',
      version: '0.1.0',
      tags: ['test'],
      variables: [],
      templates: [
        { template: 'first', root: true },
        { template: 'second' },
      ],
    };

    const result = await renderComposite(manifest, {}, source);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].content).toBe('second');
    expect(result.warnings.some((w) => w.includes('File collision'))).toBe(true);
  });

  it('warns on failed entry render instead of throwing', async () => {
    const source = mockSource({
      good: mockTemplate('good', [], [{ path: 'a.txt', content: 'a' }]),
    });
    const manifest: CompositeManifest = {
      apiVersion: 'nanohype/v1',
      kind: 'composite',
      name: 'test',
      displayName: 'Test',
      description: 'Test',
      version: '0.1.0',
      tags: ['test'],
      variables: [],
      templates: [
        { template: 'good', root: true },
        { template: 'missing', path: 'sub' },
      ],
    };

    const result = await renderComposite(manifest, {}, source);
    expect(result.files).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("Failed to render entry 'missing'"))).toBe(true);
  });
});
