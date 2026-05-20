import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSource } from '../src/sources/local.js';
import { loadAllContracts, loadContract, KNOWN_CONTRACT_REPOS } from '../src/contracts.js';
import { NanohypeError } from '../src/errors.js';

const CATALOG_ROOT = resolve(import.meta.dirname, '..', '..');

describe('loadContract', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });

  it("loads nanohype's own AGENTS.md from the catalog root", async () => {
    const c = await loadContract(source, 'nanohype');
    expect(c.repo).toBe('nanohype');
    expect(c.content).toContain('# nanohype — agent entry point');
  });

  it.each(['landing-zone', 'eks-gitops', 'aks-gitops', 'eks-agent-platform', 'kx'] as const)(
    "loads the AGENTS.md from the sibling '%s' repo",
    async (repo) => {
      const c = await loadContract(source, repo);
      expect(c.repo).toBe(repo);
      expect(c.content).toContain(`# ${repo}`);
      expect(c.content).toContain('agent entry point');
    },
  );

  it('throws NanohypeError when the repo path does not exist', async () => {
    const broken = new LocalSource({ rootDir: '/tmp/nonexistent-nanohype-contracts' });
    await expect(loadContract(broken, 'landing-zone')).rejects.toBeInstanceOf(NanohypeError);
  });
});

describe('loadAllContracts', () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });

  it('returns one entry per known repo', async () => {
    const all = await loadAllContracts(source);
    expect(all.map((c) => c.repo).sort()).toEqual([...KNOWN_CONTRACT_REPOS].sort());
    for (const c of all) {
      expect(c.content.length).toBeGreaterThan(100);
    }
  });
});
