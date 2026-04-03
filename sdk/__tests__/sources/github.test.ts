import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubSource } from '../../src/sources/github.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
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
          headers: expect.objectContaining({ Authorization: 'Bearer ghp_test123' }),
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
  });

  describe('fetchTemplate', () => {
    it('throws on missing template', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('Not found', 404));
      const source = new GitHubSource();
      await expect(source.fetchTemplate('missing')).rejects.toThrow("Template 'missing' not found");
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
});
