import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/renderer.js';
import type { SkeletonFile, TemplateManifest } from '../src/types.js';

function minimalManifest(overrides?: Partial<TemplateManifest>): TemplateManifest {
  return {
    apiVersion: 'nanohype/v1',
    name: 'test-template',
    displayName: 'Test',
    description: 'Test',
    version: '0.1.0',
    tags: ['test'],
    variables: [],
    ...overrides,
  };
}

describe('renderTemplate', () => {
  it('replaces placeholders in file content', () => {
    const manifest = minimalManifest({
      variables: [
        {
          name: 'ProjectName',
          type: 'string',
          placeholder: '__PROJECT_NAME__',
          description: 'Name',
        },
      ],
    });
    const files: SkeletonFile[] = [
      { path: 'package.json', content: '{"name": "__PROJECT_NAME__"}' },
    ];
    const result = renderTemplate(manifest, files, { ProjectName: 'my-app' });
    expect(result.files[0].content).toBe('{"name": "my-app"}');
  });

  it('replaces placeholders in file paths', () => {
    const manifest = minimalManifest({
      variables: [
        {
          name: 'ProjectName',
          type: 'string',
          placeholder: '__PROJECT_NAME__',
          description: 'Name',
        },
      ],
    });
    const files: SkeletonFile[] = [
      { path: 'cmd/__PROJECT_NAME__/main.go', content: 'package main' },
    ];
    const result = renderTemplate(manifest, files, { ProjectName: 'my-cli' });
    expect(result.files[0].path).toBe('cmd/my-cli/main.go');
  });

  it('excludes files when conditional is false', () => {
    const manifest = minimalManifest({
      variables: [
        {
          name: 'IncludeMemory',
          type: 'bool',
          placeholder: '__INCLUDE_MEMORY__',
          description: 'Memory',
        },
      ],
      conditionals: [{ path: 'src/memory', when: 'IncludeMemory' }],
    });
    const files: SkeletonFile[] = [
      { path: 'src/index.ts', content: 'main' },
      { path: 'src/memory/store.ts', content: 'store' },
      { path: 'src/memory/types.ts', content: 'types' },
    ];
    const result = renderTemplate(manifest, files, { IncludeMemory: false });
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/index.ts');
  });

  it('includes files when conditional is true', () => {
    const manifest = minimalManifest({
      variables: [
        {
          name: 'IncludeMemory',
          type: 'bool',
          placeholder: '__INCLUDE_MEMORY__',
          description: 'Memory',
        },
      ],
      conditionals: [{ path: 'src/memory', when: 'IncludeMemory' }],
    });
    const files: SkeletonFile[] = [
      { path: 'src/index.ts', content: 'main' },
      { path: 'src/memory/store.ts', content: 'store' },
    ];
    const result = renderTemplate(manifest, files, { IncludeMemory: true });
    expect(result.files).toHaveLength(2);
  });

  it('returns hooks without executing them', () => {
    const manifest = minimalManifest({
      hooks: {
        pre: [{ name: 'pre-hook', description: 'Pre', run: 'echo pre' }],
        post: [{ name: 'post-hook', description: 'Post', run: 'npm install' }],
      },
    });
    const result = renderTemplate(manifest, [], {});
    expect(result.hooks.pre).toHaveLength(1);
    expect(result.hooks.pre[0].name).toBe('pre-hook');
    expect(result.hooks.post).toHaveLength(1);
    expect(result.hooks.post[0].run).toBe('npm install');
  });

  it('returns prerequisite warnings', () => {
    const manifest = minimalManifest({
      prerequisites: [
        { name: 'node', version: '>=22', purpose: 'Runtime' },
        { name: 'docker', purpose: 'Container runtime', optional: true },
      ],
    });
    const result = renderTemplate(manifest, [], {});
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('node');
    expect(result.warnings[0]).toContain('>=22');
    expect(result.warnings[1]).toContain('(optional)');
  });

  it('replaces multiple placeholders in the same content', () => {
    const manifest = minimalManifest({
      variables: [
        {
          name: 'ProjectName',
          type: 'string',
          placeholder: '__PROJECT_NAME__',
          description: 'Name',
        },
        {
          name: 'Description',
          type: 'string',
          placeholder: '__DESCRIPTION__',
          description: 'Desc',
        },
      ],
    });
    const files: SkeletonFile[] = [
      { path: 'README.md', content: '# __PROJECT_NAME__\n\n__DESCRIPTION__' },
    ];
    const result = renderTemplate(manifest, files, {
      ProjectName: 'my-app',
      Description: 'A great app',
    });
    expect(result.files[0].content).toBe('# my-app\n\nA great app');
  });

  it('replaces all occurrences of the same placeholder', () => {
    const manifest = minimalManifest({
      variables: [{ name: 'Name', type: 'string', placeholder: '__NAME__', description: 'Name' }],
    });
    const files: SkeletonFile[] = [{ path: 'test.txt', content: '__NAME__ uses __NAME__' }];
    const result = renderTemplate(manifest, files, { Name: 'foo' });
    expect(result.files[0].content).toBe('foo uses foo');
  });

  it('strips inline #if/#endif blocks whose condition is false', () => {
    const manifest = minimalManifest({
      variables: [
        { name: 'IncludeVpc', type: 'bool', placeholder: '__INCLUDE_VPC__', description: 'Vpc' },
      ],
    });
    const files: SkeletonFile[] = [
      {
        path: 'stack.ts',
        content: ['import a;', '// #if IncludeVpc', 'import vpc;', '// #endif', 'use();'].join(
          '\n',
        ),
      },
    ];
    const off = renderTemplate(manifest, files, { IncludeVpc: false });
    expect(off.files[0].content).toBe(['import a;', 'use();'].join('\n'));
    const on = renderTemplate(manifest, files, { IncludeVpc: true });
    expect(on.files[0].content).toBe(['import a;', 'import vpc;', 'use();'].join('\n'));
  });

  it('evaluates expression file-conditionals (A || B)', () => {
    const manifest = minimalManifest({
      variables: [
        { name: 'IncludeVpc', type: 'bool', placeholder: '__INCLUDE_VPC__', description: 'Vpc' },
        { name: 'IncludeRds', type: 'bool', placeholder: '__INCLUDE_RDS__', description: 'Rds' },
      ],
      conditionals: [{ path: 'lib/vpc.ts', when: 'IncludeVpc || IncludeRds' }],
    });
    const files: SkeletonFile[] = [
      { path: 'lib/index.ts', content: 'x' },
      { path: 'lib/vpc.ts', content: 'vpc' },
    ];
    // RDS on, VPC off — VPC file must survive because RDS needs it.
    const rdsOnly = renderTemplate(manifest, files, { IncludeVpc: false, IncludeRds: true });
    expect(rdsOnly.files.map((f) => f.path)).toContain('lib/vpc.ts');
    // Both off — VPC file excluded.
    const neither = renderTemplate(manifest, files, { IncludeVpc: false, IncludeRds: false });
    expect(neither.files.map((f) => f.path)).not.toContain('lib/vpc.ts');
  });
});
