import type { CatalogSource } from './source.js';
import type { Contract, ContractRepo, ContractRepoInfo } from './types.js';

// The single source of truth for the contract surface: every nanohype repo that
// ships an AGENTS.md, plus whether it's public or private. KNOWN_CONTRACT_REPOS
// (names) and CONTRACT_REPOS (descriptors) are derived from this.
const ALL_REPOS: ContractRepoInfo[] = [
  { repo: 'nanohype', visibility: 'public' },
  { repo: 'landing-zone', visibility: 'public' },
  { repo: 'eks-gitops', visibility: 'public' },
  { repo: 'eks-agent-platform', visibility: 'public' },
  { repo: 'kx', visibility: 'public' },
  { repo: 'cloudgov', visibility: 'public' },
  { repo: 'fab', visibility: 'public' },
  { repo: 'portal', visibility: 'public' },
  { repo: 'eks-fleet', visibility: 'public' },
];

/**
 * Load a single repo's AGENTS.md content. The catalog source resolves the
 * right filesystem or GitHub path per repo — see `LocalSource.fetchContract`
 * and `GitHubSource.fetchContract` for the resolution rules. The repo's
 * visibility is stamped onto the result when it's a known descriptor.
 */
export async function loadContract(
  source: CatalogSource,
  repo: ContractRepo,
): Promise<Contract> {
  const content = await source.fetchContract(repo);
  const visibility = ALL_REPOS.find((r) => r.repo === repo)?.visibility;
  return visibility ? { repo, content, visibility } : { repo, content };
}

/**
 * Load every repo's AGENTS.md. Best-effort: a repo that can't be resolved — a
 * private repo with no token, or a transient fetch error — is skipped with a
 * warning instead of failing the whole load, so an MCP server still serves every
 * public contract. The single-repo `loadContract` / `get_contract` path still
 * surfaces the underlying error, which is the honest signal for a direct request.
 */
export async function loadAllContracts(source: CatalogSource): Promise<Contract[]> {
  const settled = await Promise.allSettled(
    ALL_REPOS.map(async (r) => loadContract(source, r.repo)),
  );
  const loaded: Contract[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      loaded.push(result.value);
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn(`[contracts] skipping ${ALL_REPOS[i].repo}: ${reason}`);
    }
  });
  return loaded;
}

/** The canonical list of supporting repos that ship an AGENTS.md (names only). */
export const KNOWN_CONTRACT_REPOS: readonly ContractRepo[] = ALL_REPOS.map((r) => r.repo);

/** True when `value` names a known contract repo. */
export function isContractRepo(value: unknown): value is ContractRepo {
  return typeof value === 'string' && ALL_REPOS.some((r) => r.repo === value);
}

/** The contract repos with their visibility — for callers that label or gate on it. */
export const CONTRACT_REPOS: readonly ContractRepoInfo[] = ALL_REPOS;
