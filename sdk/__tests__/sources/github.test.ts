import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubSource } from '../../src/sources/github.js';

const mockFetch = vi.fn();

beforeEach(() => {
  // vitest 4's `vi.restoreAllMocks()` no longer clears call state on
  // top-level `vi.fn()` instances — reset between tests explicitly so
  // `mock.calls` and `toHaveBeenCalledTimes` start clean.
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, { status });
}

describe('GitHubSource', () => {
  describe('constructor defaults', () => {
    it('uses nanohype/nanohype repo and main ref by default', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      const source = new GitHubSource();
      await source.listTemplates();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('repos/nanohype/nanohype/contents/templates?ref=main'),
        expect.any(Object),
      );
    });

    it('accepts custom repo and ref', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      const source = new GitHubSource({ repo: 'org/repo', ref: 'v1.0.0' });
      await source.listTemplates();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('repos/org/repo/contents/templates?ref=v1.0.0'),
        expect.any(Object),
      );
    });
  });

  describe('authorization', () => {
    it('includes Bearer token when provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      const source = new GitHubSource({ token: 'ghp_test123' });
      await source.listTemplates();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer ghp_test123',
          }),
        }),
      );
    });

    it('omits Authorization header when no token', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      const source = new GitHubSource();
      await source.listTemplates();
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('listTemplates', () => {
    it('parses directory listing and fetches manifests', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse([
            { name: 'go-cli', type: 'dir' },
            { name: 'README.md', type: 'file' },
          ]),
        )
        .mockResolvedValueOnce(
          textResponse(
            'apiVersion: nanohype/v1\nname: go-cli\ndisplayName: Go CLI\ndescription: A Go CLI\nversion: "1.0.0"\ntags: [go, cli]\nvariables: []',
          ),
        );

      const source = new GitHubSource();
      const entries = await source.listTemplates();
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('go-cli');
      expect(entries[0].displayName).toBe('Go CLI');
    });

    it('caches results within TTL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      const source = new GitHubSource({ cacheTtl: 60_000 });
      await source.listTemplates();
      await source.listTemplates();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 403));
      const source = new GitHubSource();
      await expect(source.listTemplates()).rejects.toThrow('Failed to list catalog: 403');
    });

    it('skips directories without a manifest but throws on other manifest failures', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse([{ name: 'not-a-template', type: 'dir' }]))
        .mockResolvedValueOnce(textResponse('Not found', 404));
      const source = new GitHubSource();
      await expect(source.listTemplates()).resolves.toEqual([]);

      mockFetch
        .mockResolvedValueOnce(jsonResponse([{ name: 'go-cli', type: 'dir' }]))
        .mockResolvedValueOnce(textResponse('rate limited', 429));
      const rateLimited = new GitHubSource({ cacheTtl: 0 });
      await expect(rateLimited.listTemplates()).rejects.toThrow(
        "Failed to fetch manifest for template 'go-cli': 429",
      );
    });

    it('throws on an unparseable manifest instead of dropping the entry', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse([{ name: 'go-cli', type: 'dir' }]))
        .mockResolvedValueOnce(textResponse('{{ not: yaml: at: all'));
      const source = new GitHubSource();
      await expect(source.listTemplates()).rejects.toThrow(
        "Invalid manifest for template 'go-cli'",
      );
    });

    it('bounds every request with an abort signal', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      const source = new GitHubSource();
      await source.listTemplates();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('fetchTemplate', () => {
    it('throws on missing template', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('Not found', 404));
      const source = new GitHubSource();
      await expect(source.fetchTemplate('missing')).rejects.toThrow("Template 'missing' not found");
    });

    it('parses manifest, fetches skeleton tree, and returns files', async () => {
      const manifestYaml = [
        'apiVersion: nanohype/v1',
        'name: go-cli',
        'displayName: Go CLI',
        'description: A Go CLI starter',
        'version: "1.0.0"',
        'tags: [go, cli]',
        'variables: []',
      ].join('\n');

      mockFetch
        // 1. Manifest YAML fetch
        .mockResolvedValueOnce(textResponse(manifestYaml))
        // 2. Git tree listing (recursive)
        .mockResolvedValueOnce(
          jsonResponse({
            tree: [
              {
                path: 'templates/go-cli/template.yaml',
                type: 'blob',
                sha: 'aaa',
              },
              {
                path: 'templates/go-cli/skeleton/main.go',
                type: 'blob',
                sha: 'bbb',
              },
              {
                path: 'templates/go-cli/skeleton/pkg/util.go',
                type: 'blob',
                sha: 'ccc',
              },
              {
                path: 'templates/other/skeleton/index.ts',
                type: 'blob',
                sha: 'ddd',
              },
              { path: 'templates/go-cli/skeleton', type: 'tree', sha: 'eee' },
            ],
          }),
        )
        // 3. File content fetches (only the two skeleton blobs matching the prefix)
        .mockResolvedValueOnce(textResponse('package main\n\nfunc main() {}'))
        .mockResolvedValueOnce(textResponse('package pkg\n\nfunc Util() {}'));

      const source = new GitHubSource();
      const { manifest, files } = await source.fetchTemplate('go-cli');

      // Manifest is parsed correctly
      expect(manifest.apiVersion).toBe('nanohype/v1');
      expect(manifest.name).toBe('go-cli');
      expect(manifest.displayName).toBe('Go CLI');
      expect(manifest.description).toBe('A Go CLI starter');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.tags).toEqual(['go', 'cli']);

      // Skeleton files have paths relative to the skeleton/ directory
      expect(files).toHaveLength(2);
      expect(files[0]).toEqual({
        path: 'main.go',
        content: 'package main\n\nfunc main() {}',
      });
      expect(files[1]).toEqual({
        path: 'pkg/util.go',
        content: 'package pkg\n\nfunc Util() {}',
      });

      // Verify the correct URLs were called
      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(mockFetch.mock.calls[0][0]).toContain(
        'raw.githubusercontent.com/nanohype/nanohype/main/templates/go-cli/template.yaml',
      );
      expect(mockFetch.mock.calls[1][0]).toContain(
        'api.github.com/repos/nanohype/nanohype/git/trees/main?recursive=1',
      );
    });

    it('throws when a skeleton file fails to fetch — never renders a partial scaffold', async () => {
      const manifestYaml = [
        'apiVersion: nanohype/v1',
        'name: go-cli',
        'displayName: Go CLI',
        'description: A Go CLI starter',
        'version: "1.0.0"',
        'tags: [go, cli]',
        'variables: []',
      ].join('\n');

      mockFetch
        .mockResolvedValueOnce(textResponse(manifestYaml))
        .mockResolvedValueOnce(
          jsonResponse({
            tree: [
              {
                path: 'templates/go-cli/skeleton/main.go',
                type: 'blob',
                sha: 'aaa',
              },
              {
                path: 'templates/go-cli/skeleton/pkg/util.go',
                type: 'blob',
                sha: 'bbb',
              },
            ],
          }),
        )
        .mockResolvedValueOnce(textResponse('package main'))
        .mockResolvedValueOnce(textResponse('Server error', 500));

      const source = new GitHubSource();
      await expect(source.fetchTemplate('go-cli')).rejects.toThrow(
        "Failed to fetch skeleton file 'templates/go-cli/skeleton/pkg/util.go' for template 'go-cli': 500",
      );
    });
  });

  describe('listComposites', () => {
    it('parses composite directory listing', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse([
            { name: 'ai-chatbot.yaml', type: 'file' },
            { name: 'not-yaml.md', type: 'file' },
          ]),
        )
        .mockResolvedValueOnce(
          textResponse(
            'apiVersion: nanohype/v1\nkind: composite\nname: ai-chatbot\ndisplayName: AI Chatbot\ndescription: Full stack\nversion: "1.0.0"\ntags: [ai]\nvariables: []\ntemplates:\n  - template: agentic-loop\n    root: true',
          ),
        );

      const source = new GitHubSource();
      const entries = await source.listComposites();
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('ai-chatbot');
      expect(entries[0].templateCount).toBe(1);
    });
  });

  describe('fetchComposite', () => {
    it('throws on missing composite', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('Not found', 404));
      const source = new GitHubSource();
      await expect(source.fetchComposite('missing')).rejects.toThrow(
        "Composite 'missing' not found",
      );
    });
  });

  describe('name shape guards', () => {
    // Names are interpolated into request paths — a malformed one must be
    // rejected before any request is issued.
    it('rejects traversal in template names without fetching', async () => {
      const source = new GitHubSource();
      await expect(source.fetchTemplate('../evil')).rejects.toThrow('Invalid template name');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects path separators and URL metacharacters in template names', async () => {
      const source = new GitHubSource();
      await expect(source.fetchTemplate('a/b')).rejects.toThrow('Invalid template name');
      await expect(source.fetchTemplate('name?ref=evil')).rejects.toThrow('Invalid template name');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects null bytes and empty template names', async () => {
      const source = new GitHubSource();
      await expect(source.fetchTemplate('go-cli\0evil')).rejects.toThrow('Invalid template name');
      await expect(source.fetchTemplate('')).rejects.toThrow('Invalid template name');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects malformed composite names without fetching', async () => {
      const source = new GitHubSource();
      await expect(source.fetchComposite('../../secrets')).rejects.toThrow(
        'Invalid composite name',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects standards outside the published set without fetching', async () => {
      const source = new GitHubSource();
      await expect(
        source.fetchStandard('../package' as Parameters<typeof source.fetchStandard>[0]),
      ).rejects.toThrow('Unknown standard');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects contract repos outside the known set without fetching', async () => {
      const source = new GitHubSource();
      await expect(
        source.fetchContract('nanohype/main/evil' as Parameters<typeof source.fetchContract>[0]),
      ).rejects.toThrow('Unknown contract repo');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

describe('GitHubSource.fetchContract', () => {
  it('resolves a public repo via raw.githubusercontent when no token is set', async () => {
    // The constructor falls back to GITHUB_TOKEN, which CI sets — clear it so this
    // exercises the no-token path.
    vi.stubEnv('GITHUB_TOKEN', '');
    mockFetch.mockResolvedValueOnce(textResponse('# eks-gitops — agent entry point'));
    const source = new GitHubSource();
    const md = await source.fetchContract('eks-gitops');
    expect(md).toContain('# eks-gitops');
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('raw.githubusercontent.com/nanohype/eks-gitops/main/AGENTS.md');
    vi.unstubAllEnvs();
  });

  it('resolves via the authenticated contents API when a token is set', async () => {
    const md = '# eks-fleet — agent entry point';
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        content: Buffer.from(md).toString('base64'),
        encoding: 'base64',
      }),
    );
    const source = new GitHubSource({ token: 'ghp_x' });
    const out = await source.fetchContract('eks-fleet');
    expect(out).toBe(md);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api.github.com/repos/nanohype/eks-fleet/contents/AGENTS.md?ref=main');
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer ghp_x');
  });

  it('falls back to GITHUB_TOKEN from the environment for the contents API', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'env_token');
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        content: Buffer.from('# kx').toString('base64'),
        encoding: 'base64',
      }),
    );
    const source = new GitHubSource();
    await source.fetchContract('kx');
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer env_token');
    vi.unstubAllEnvs();
  });

  it('throws NanohypeError when the AGENTS.md is missing', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    mockFetch.mockResolvedValueOnce(textResponse('Not Found', 404));
    const source = new GitHubSource();
    await expect(source.fetchContract('landing-zone')).rejects.toThrow(
      "AGENTS.md for repo 'landing-zone' not found",
    );
    vi.unstubAllEnvs();
  });
});
