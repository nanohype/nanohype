import { describe, expect, it } from 'vitest';
import { resolveVariables } from '../src/resolver.js';
import type { TemplateVariable } from '../src/types.js';

function v(overrides: Partial<TemplateVariable> & { name: string }): TemplateVariable {
  return {
    type: 'string',
    placeholder: `__${overrides.name.replace(/([A-Z])/g, '_$1').toUpperCase()}__`,
    description: overrides.name,
    ...overrides,
  };
}

describe('resolveVariables', () => {
  it('applies provided values', () => {
    const result = resolveVariables(
      [v({ name: 'ProjectName' })],
      { ProjectName: 'my-app' },
    );
    expect(result.ProjectName).toBe('my-app');
  });

  it('falls back to defaults', () => {
    const result = resolveVariables(
      [v({ name: 'ProjectName', default: 'default-app' })],
      {},
    );
    expect(result.ProjectName).toBe('default-app');
  });

  it('uses type zero-values for non-required without default', () => {
    const result = resolveVariables(
      [
        v({ name: 'Str', type: 'string' }),
        v({ name: 'Bool', type: 'bool' }),
        v({ name: 'Num', type: 'int' }),
      ],
      {},
    );
    expect(result.Str).toBe('');
    expect(result.Bool).toBe('false');
    expect(result.Num).toBe('0');
  });

  it('throws on missing required variable', () => {
    expect(() =>
      resolveVariables([v({ name: 'Name', required: true })], {}),
    ).toThrow("Required variable 'Name' has no value and no default");
  });

  it('expands ${VarName} cross-references', () => {
    const result = resolveVariables(
      [
        v({ name: 'ProjectName' }),
        v({ name: 'ModulePath', default: 'packages/${ProjectName}' }),
      ],
      { ProjectName: 'my-app' },
    );
    expect(result.ModulePath).toBe('packages/my-app');
  });

  it('detects direct circular references (A→A)', () => {
    expect(() =>
      resolveVariables(
        [v({ name: 'A', default: '${A}' })],
        {},
      ),
    ).toThrow("Circular reference in variable 'A'");
  });

  it('detects indirect circular references (A→B→A)', () => {
    expect(() =>
      resolveVariables(
        [
          v({ name: 'A', default: '${B}' }),
          v({ name: 'B', default: '${A}' }),
        ],
        {},
      ),
    ).toThrow(/[Cc]ircular reference/);
  });

  it('throws on reference to unknown variable', () => {
    expect(() =>
      resolveVariables(
        [v({ name: 'A', default: '${Nonexistent}' })],
        {},
      ),
    ).toThrow("references unknown variable 'Nonexistent'");
  });

  it('validates enum membership', () => {
    expect(() =>
      resolveVariables(
        [v({ name: 'Provider', type: 'enum', options: ['a', 'b'] })],
        { Provider: 'c' },
      ),
    ).toThrow("not in options: a, b");
  });

  it('validates regex patterns', () => {
    expect(() =>
      resolveVariables(
        [
          v({
            name: 'Name',
            validation: { pattern: '[a-z-]+', message: 'Must be kebab-case' },
          }),
        ],
        { Name: 'Not Kebab' },
      ),
    ).toThrow('Must be kebab-case');
  });

  it('passes valid regex patterns', () => {
    const result = resolveVariables(
      [v({ name: 'Name', validation: { pattern: '[a-z-]+' } })],
      { Name: 'my-app' },
    );
    expect(result.Name).toBe('my-app');
  });

  it('converts boolean and number values to strings', () => {
    const result = resolveVariables(
      [
        v({ name: 'Flag', type: 'bool' }),
        v({ name: 'Count', type: 'int' }),
      ],
      { Flag: true, Count: 42 },
    );
    expect(result.Flag).toBe('true');
    expect(result.Count).toBe('42');
  });
});
