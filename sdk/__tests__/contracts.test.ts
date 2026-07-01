import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSource } from '../src/sources/local.js';
import {
  isContractRepo,
  loadAllContracts,
  loadContract,
  KNOWN_CONTRACT_REPOS,
} from '../src/contracts.js';
import { NanohypeError } from '../src/errors.js';
import type { CatalogSource } from '../src/source.js';

// Fixture mirrors the org layout (a nanohype/ dir with sibling repo dirs)
// so the contract loader is exercised without a real sibling checkout.
const FIXTURE_ROOT = resolve(import.meta.dirname, 'fixtures', 'contracts', 'nanohype');

describe('loadContract', () => {
  const source = new LocalSource({ rootDir: FIXTURE_ROOT });

  it("loads nanohype's own AGENTS.md from the catalog root", async () => {
    const c = await loadContract(source, 'nanohype');
    expect(c.repo).toBe('nanohype');
    expect(c.content).toContain('# nanohype — agent entry point');
  });

  it.each([
    'landing-zone',
    'eks-gitops',
    'eks-agent-platform',
    'kx',
    'cloudgov',
    'fab',
    'portal',
    'eks-fleet',
  ] as const)("loads the AGENTS.md from the sibling '%s' repo", async (repo) => {
    const c = await loadContract(source, repo);
    expect(c.repo).toBe(repo);
    expect(c.content).toContain(`# ${repo}`);
    expect(c.content).toContain('agent entry point');
  });

  it('stamps the repo visibility onto the loaded contract', async () => {
    expect((await loadContract(source, 'eks-gitops')).visibility).toBe('public');
    expect((await loadContract(source, 'eks-fleet')).visibility).toBe('public');
  });

  it('throws NanohypeError when the repo path does not exist', async () => {
    const broken = new LocalSource({ rootDir: '/tmp/nonexistent-nanohype-contracts' });
    await expect(loadContract(broken, 'landing-zone')).rejects.toBeInstanceOf(NanohypeError);
  });
});

describe('loadAllContracts', () => {
  const source = new LocalSource({ rootDir: FIXTURE_ROOT });

  it('returns one entry per known repo', async () => {
    const all = await loadAllContracts(source);
    expect(all.map((c) => c.repo).sort()).toEqual([...KNOWN_CONTRACT_REPOS].sort());
    for (const c of all) {
      expect(c.content.length).toBeGreaterThan(100);
    }
  });

  it('skips a repo that fails to resolve instead of rejecting the whole load', async () => {
    // A source that resolves everything except eks-fleet — the shape of a
    // transient fetch failure, or a future private repo fetched without a token
    // (404). The load must degrade, not throw.
    const partial = {
      async fetchContract(repo: string) {
        if (repo === 'eks-fleet') throw new NanohypeError('AGENTS.md for repo \'eks-fleet\' not found: 404');
        return `# ${repo} — agent entry point\n\n${'x'.repeat(150)}`;
      },
    } as unknown as CatalogSource;

    const all = await loadAllContracts(partial);
    const repos = all.map((c) => c.repo);
    expect(repos).not.toContain('eks-fleet');
    expect(repos).toContain('nanohype');
    expect(repos).toContain('fab');
    expect(all.length).toBe(KNOWN_CONTRACT_REPOS.length - 1);
  });
});

describe('KNOWN_CONTRACT_REPOS', () => {
  it('reflects the current contract surface', () => {
    expect(KNOWN_CONTRACT_REPOS).not.toContain('aks-gitops');
    expect(KNOWN_CONTRACT_REPOS).toContain('fab');
    expect(KNOWN_CONTRACT_REPOS).toContain('portal');
    expect(KNOWN_CONTRACT_REPOS).toContain('eks-fleet');
  });
});

describe('isContractRepo', () => {
  it('accepts every known contract repo', () => {
    for (const repo of KNOWN_CONTRACT_REPOS) {
      expect(isContractRepo(repo)).toBe(true);
    }
  });

  it('rejects anything outside the known set', () => {
    expect(isContractRepo('aks-gitops')).toBe(false);
    expect(isContractRepo('../nanohype')).toBe(false);
    expect(isContractRepo('nanohype/main/evil')).toBe(false);
    expect(isContractRepo(42)).toBe(false);
    expect(isContractRepo(undefined)).toBe(false);
  });
});
