import type { CatalogSource } from './source.js';
import type { Catalog } from './types.js';
import { NanohypeError } from './errors.js';

/**
 * Load the catalog manifest (`catalog.json`) from a source.
 *
 * Returns the parsed catalog with its full template + composite lists.
 * The catalog is generated deterministically by the nanohype repo's
 * `scripts/generate-catalog.mjs` and committed at the repo root, so this
 * fetch is a single file read for `LocalSource` and a single HTTP call
 * for `GitHubSource`.
 *
 * Throws `NanohypeError` if the manifest is missing, unparseable, or
 * the kind discriminator doesn't match.
 */
export async function loadCatalog(source: CatalogSource): Promise<Catalog> {
  const catalog = await source.fetchCatalogManifest();
  if (catalog.kind !== 'nanohype/catalog') {
    throw new NanohypeError(
      `Unexpected catalog kind: ${String(catalog.kind)} (expected 'nanohype/catalog')`,
    );
  }
  return catalog;
}
