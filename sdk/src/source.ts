import type {
  CatalogEntry,
  CompositeCatalogEntry,
  CompositeManifest,
  SkeletonFile,
  TemplateManifest,
} from './types.js';

export interface CatalogSource {
  listTemplates(): Promise<CatalogEntry[]>;
  fetchTemplate(name: string): Promise<{ manifest: TemplateManifest; files: SkeletonFile[] }>;
  listComposites(): Promise<CompositeCatalogEntry[]>;
  fetchComposite(name: string): Promise<CompositeManifest>;
}

export interface GitHubSourceOptions {
  repo?: string;
  ref?: string;
  token?: string;
  cacheTtl?: number;
}

export interface LocalSourceOptions {
  rootDir: string;
}
