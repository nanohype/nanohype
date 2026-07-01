import type {
  Catalog,
  CatalogEntry,
  CompositeCatalogEntry,
  CompositeManifest,
  ContractRepo,
  Standard,
  StandardName,
  SkeletonFile,
  TemplateManifest,
} from "./types.js";

export interface CatalogSource {
  listTemplates(): Promise<CatalogEntry[]>;
  fetchTemplate(
    name: string,
  ): Promise<{ manifest: TemplateManifest; files: SkeletonFile[] }>;
  listComposites(): Promise<CompositeCatalogEntry[]>;
  fetchComposite(name: string): Promise<CompositeManifest>;

  /**
   * Fetch the catalog manifest (catalog.json) — the machine-readable index
   * of every template and composite. Faster than re-walking the filesystem
   * or paging the GitHub API.
   */
  fetchCatalogManifest(): Promise<Catalog>;

  /** Fetch a single standards file (standards/<name>.json). */
  fetchStandard(name: StandardName): Promise<Standard>;

  /** Fetch a repo's AGENTS.md content. The catalog source resolves the right path per repo. */
  fetchContract(repo: ContractRepo): Promise<string>;
}

export interface GitHubSourceOptions {
  repo?: string;
  ref?: string;
  token?: string;
  cacheTtl?: number;
  /** Per-request timeout in milliseconds for GitHub API calls. Default 10 000. */
  requestTimeout?: number;
}

export interface LocalSourceOptions {
  rootDir: string;
}
