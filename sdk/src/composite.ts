import { VariableResolutionError } from './errors.js';
import { renderTemplate } from './renderer.js';
import type { CatalogSource } from './source.js';
import type {
  CompositeManifest,
  CompositeRenderResult,
  SkeletonFile,
  TemplateHook,
} from './types.js';
import { validateCompositeManifest } from './validator.js';

/**
 * Render a composite — fetches and renders each template entry according
 * to the nanohype composite contract (v1):
 *   1. Validate composite manifest
 *   2. Resolve composite-level variables
 *   3. Evaluate entry conditions — skip entries whose bool variable is false
 *   4. For each entry: resolve variables, fetch + render template, prefix paths
 *   5. Merge file trees (root entry at /, others at entry.path/)
 */
export async function renderComposite(
  manifest: CompositeManifest,
  values: Record<string, string | boolean | number>,
  source: CatalogSource,
): Promise<CompositeRenderResult> {
  validateCompositeManifest(manifest);

  const warnings: string[] = [];
  const allFiles: SkeletonFile[] = [];
  const allHooks: { pre: TemplateHook[]; post: TemplateHook[] } = { pre: [], post: [] };
  const entries: { template: string; path?: string; fileCount: number }[] = [];

  // Resolve composite-level variables
  const resolved: Record<string, string> = {};
  for (const v of manifest.variables) {
    if (v.name in values) {
      resolved[v.name] = String(values[v.name]);
    } else if (v.default !== undefined) {
      resolved[v.name] = String(v.default);
    } else if (v.required) {
      throw new VariableResolutionError(
        `Required composite variable '${v.name}' has no value and no default`,
      );
    } else {
      resolved[v.name] = v.type === 'bool' ? 'false' : v.type === 'int' ? '0' : '';
    }
  }

  // Evaluate conditions and order entries (root first)
  const activeEntries = manifest.templates.filter((entry) => {
    if (!entry.condition) return true;
    return resolved[entry.condition] === 'true';
  });

  const rootEntry = activeEntries.find((e) => e.root);
  const nonRootEntries = activeEntries.filter((e) => !e.root);
  const orderedEntries = rootEntry ? [rootEntry, ...nonRootEntries] : nonRootEntries;

  // Scaffold each entry
  for (const entry of orderedEntries) {
    // Resolve entry-level variable overrides with ${VarName} expansion
    const entryValues: Record<string, string | boolean | number> = {};
    if (entry.variables) {
      for (const [key, val] of Object.entries(entry.variables)) {
        if (typeof val === 'string') {
          entryValues[key] = val.replace(/\$\{(\w+)\}/g, (_, ref: string) => resolved[ref] ?? '');
        } else {
          entryValues[key] = val;
        }
      }
    }

    try {
      const { manifest: tmplManifest, files } = await source.fetchTemplate(entry.template);
      const result = renderTemplate(tmplManifest, files, entryValues);

      // Prefix paths for non-root entries
      const prefix = entry.root ? '' : (entry.path ? entry.path + '/' : '');
      for (const file of result.files) {
        const prefixedPath = prefix + file.path;
        // Last-writer-wins on path collisions
        const existingIdx = allFiles.findIndex((f) => f.path === prefixedPath);
        if (existingIdx !== -1) {
          warnings.push(`File collision: ${prefixedPath} (overwritten by ${entry.template})`);
          allFiles[existingIdx] = { path: prefixedPath, content: file.content };
        } else {
          allFiles.push({ path: prefixedPath, content: file.content });
        }
      }

      allHooks.pre.push(...result.hooks.pre);
      allHooks.post.push(...result.hooks.post);
      warnings.push(...result.warnings);

      entries.push({ template: entry.template, path: entry.path, fileCount: result.files.length });
    } catch (err) {
      warnings.push(
        `Failed to render entry '${entry.template}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { files: allFiles, warnings, hooks: allHooks, entries };
}
