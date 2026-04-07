import { describe, expect, it } from 'vitest';
import { validateManifest, validateCompositeManifest } from '../src/validator.js';
import type { TemplateManifest, CompositeManifest } from '../src/types.js';

function minimalManifest(overrides?: Partial<TemplateManifest>): TemplateManifest {
  return {
    apiVersion: 'nanohype/v1',
    name: 'test-template',
    displayName: 'Test Template',
    description: 'A test template',
    version: '0.1.0',
    tags: ['test'],
    variables: [],
    ...overrides,
  };
}

describe('validateManifest', () => {
  it('accepts a valid minimal manifest', () => {
    expect(() => validateManifest(minimalManifest())).not.toThrow();
  });

  it('rejects unsupported apiVersion', () => {
    expect(() => validateManifest(minimalManifest({ apiVersion: 'nanohype/v2' }))).toThrow(
      'Unsupported apiVersion',
    );
  });

  it('rejects enum variable without options', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'Provider',
              type: 'enum',
              placeholder: '__PROVIDER__',
              description: 'The provider',
            },
          ],
        }),
      ),
    ).toThrow("Enum variable 'Provider' has no options");
  });

  it('accepts enum variable with options', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'Provider',
              type: 'enum',
              placeholder: '__PROVIDER__',
              description: 'The provider',
              options: ['a', 'b'],
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects conditional referencing unknown variable', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          conditionals: [{ path: 'src/foo.ts', when: 'Missing' }],
        }),
      ),
    ).toThrow("Conditional references unknown variable 'Missing'");
  });

  it('rejects conditional referencing non-bool variable', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'Name',
              type: 'string',
              placeholder: '__NAME__',
              description: 'Name',
            },
          ],
          conditionals: [{ path: 'src/foo.ts', when: 'Name' }],
        }),
      ),
    ).toThrow("must reference bool variable, got 'string'");
  });

  it('accepts conditional referencing bool variable', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'IncludeFoo',
              type: 'bool',
              placeholder: '__INCLUDE_FOO__',
              description: 'Include foo',
            },
          ],
          conditionals: [{ path: 'src/foo.ts', when: 'IncludeFoo' }],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects duplicate placeholders', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'Foo',
              type: 'string',
              placeholder: '__DUPE__',
              description: 'Foo',
            },
            {
              name: 'Bar',
              type: 'string',
              placeholder: '__DUPE__',
              description: 'Bar',
            },
          ],
        }),
      ),
    ).toThrow('Duplicate placeholder: __DUPE__');
  });

  it('rejects placeholder that is a substring of another', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'Name',
              type: 'string',
              placeholder: 'NAME',
              description: 'Name',
            },
            {
              name: 'ProjectName',
              type: 'string',
              placeholder: 'PROJECT_NAME',
              description: 'Project Name',
            },
          ],
        }),
      ),
    ).toThrow("is a substring of");
  });

  it('rejects bool variable with non-boolean default', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'Flag',
              type: 'bool',
              placeholder: '__FLAG__',
              description: 'Flag',
              default: 'yes' as unknown as boolean,
            },
          ],
        }),
      ),
    ).toThrow("is type bool but default is 'yes'");
  });

  it('rejects int variable with string default', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'Port',
              type: 'int',
              placeholder: '__PORT__',
              description: 'Port',
              default: 'abc' as unknown as number,
            },
          ],
        }),
      ),
    ).toThrow("is type int but default is 'abc'");
  });

  it('rejects enum variable with default not in options', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'Provider',
              type: 'enum',
              placeholder: '__PROVIDER__',
              description: 'Provider',
              options: ['a', 'b'],
              default: 'c',
            },
          ],
        }),
      ),
    ).toThrow("default 'c' not in options: a, b");
  });

  it('accepts valid default values', () => {
    expect(() =>
      validateManifest(
        minimalManifest({
          variables: [
            {
              name: 'Flag',
              type: 'bool',
              placeholder: '__FLAG__',
              description: 'Flag',
              default: true,
            },
            {
              name: 'Port',
              type: 'int',
              placeholder: '__PORT__',
              description: 'Port',
              default: 8080,
            },
            {
              name: 'Provider',
              type: 'enum',
              placeholder: '__PROVIDER__',
              description: 'Provider',
              options: ['a', 'b'],
              default: 'a',
            },
          ],
        }),
      ),
    ).not.toThrow();
  });
});

describe('validateCompositeManifest', () => {
  it('accepts a valid composite manifest', () => {
    const manifest: CompositeManifest = {
      apiVersion: 'nanohype/v1',
      kind: 'composite',
      name: 'test-composite',
      displayName: 'Test Composite',
      description: 'A test composite',
      version: '0.1.0',
      tags: ['test'],
      variables: [],
      templates: [],
    };
    expect(() => validateCompositeManifest(manifest)).not.toThrow();
  });

  it('rejects unsupported apiVersion', () => {
    const manifest = {
      apiVersion: 'nanohype/v2',
      kind: 'composite' as const,
      name: 'test',
      displayName: 'Test',
      description: 'Test',
      version: '0.1.0',
      tags: ['test'],
      variables: [],
      templates: [],
    };
    expect(() => validateCompositeManifest(manifest)).toThrow('Unsupported apiVersion');
  });

  it('rejects wrong kind', () => {
    const manifest = {
      apiVersion: 'nanohype/v1',
      kind: 'template' as 'composite',
      name: 'test',
      displayName: 'Test',
      description: 'Test',
      version: '0.1.0',
      tags: ['test'],
      variables: [],
      templates: [],
    };
    expect(() => validateCompositeManifest(manifest)).toThrow("Expected kind 'composite'");
  });
});
