import type { CatalogSource } from './source.js';
import type { Contract, ContractRepo } from './types.js';

const ALL_REPOS: ContractRepo[] = [
  'nanohype',
  'landing-zone',
  'eks-gitops',
  'aks-gitops',
  'eks-agent-platform',
  'kx',
  'cloudgov',
];

/**
 * Load a single repo's AGENTS.md content. The catalog source resolves the
 * right filesystem or GitHub path per repo — see `LocalSource.fetchContract`
 * and `GitHubSource.fetchContract` for the resolution rules.
 */
export async function loadContract(
  source: CatalogSource,
  repo: ContractRepo,
): Promise<Contract> {
  const content = await source.fetchContract(repo);
  return { repo, content };
}

/**
 * Load every repo's AGENTS.md in parallel. Useful for an MCP server that
 * wants to expose the full set of contracts as resources up-front.
 */
export async function loadAllContracts(source: CatalogSource): Promise<Contract[]> {
  return Promise.all(ALL_REPOS.map((repo) => loadContract(source, repo)));
}

/** The canonical list of supporting repos that ship an AGENTS.md. */
export const KNOWN_CONTRACT_REPOS: readonly ContractRepo[] = ALL_REPOS;
