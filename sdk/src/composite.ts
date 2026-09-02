import { VariableResolutionError } from "./errors.js";
import { assertDescendingPath, PathContainmentError } from "./paths.js";
import { renderTemplate } from "./renderer.js";
import { resolveVariables } from "./resolver.js";
import type { CatalogSource } from "./source.js";
import type {
  CompositeManifest,
  CompositeRenderResult,
  SkeletonFile,
  TemplateHook,
} from "./types.js";
import { validateCompositeManifest } from "./validator.js";

/**
 * Render a composite — fetches and renders each template entry according
 * to the nanohype composite contract (v1):
 *   1. Validate composite manifest
 *   2. Resolve composite-level variables
 *   3. Evaluate entry conditions — skip entries whose bool variable is false,
 *      and reject a condition naming a variable the composite does not declare
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

  // Resolve composite-level variables through the same resolver a template
  // uses. A composite declares variables in the template shape, so the cascade
  // is identical — and re-implementing it here dropped the `${VarName}`
  // expansion pass, which is not an omission a composite can survive. A
  // composite default like `${GroupId}.app` reached the child template as
  // literal text, and the child does not declare `GroupId`, so the render died
  // inside the entry rather than at the composite that wrote it.
  //
  // Required-variable failures keep their composite wording: at this layer the
  // caller supplied composite inputs, not template ones, and naming the wrong
  // layer is the difference between a fixable error and a confusing one.
  for (const v of manifest.variables) {
    if (v.required && !(v.name in values) && v.default === undefined) {
      throw new VariableResolutionError(
        `Required composite variable '${v.name}' has no value and no default`,
      );
    }
  }
  const resolved = resolveVariables(manifest.variables, values);

  // `resolved` is keyed by exactly the names this composite declares, so
  // membership in it is the test for whether an entry names something real.
  const declares = (ref: string) => ref in resolved;

  // Evaluate conditions and order entries (root first).
  //
  // An undeclared condition name reads as `undefined !== "true"`, which excludes
  // the entry — the same outcome, and the same silence, as a condition that is
  // deliberately false. Left to that, a composite loses a member to a typo,
  // renders successfully, and scaffolds a project missing whatever that member
  // provided. Nothing downstream can tell the two apart, so the difference has
  // to be made here.
  const activeEntries = manifest.templates.filter((entry) => {
    if (!entry.condition) return true;
    if (!declares(entry.condition)) {
      throw new VariableResolutionError(
        `Entry '${entry.template}' has condition '${entry.condition}', ` +
          "which this composite does not declare",
      );
    }
    return resolved[entry.condition] === "true";
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
        if (typeof val === "string") {
          // An unresolvable reference expanded to the empty string reaches the
          // child template as a falsy value, which makes a mistyped variable
          // name indistinguishable from asking for that feature to be off — the
          // files it gates simply leave the output. `resolveVariables` already
          // rejects the same `${Name}` syntax in a composite-level default, so
          // the two layers of one manifest must agree about it.
          entryValues[key] = val.replace(/\$\{(\w+)\}/g, (_, ref: string) => {
            if (!declares(ref)) {
              throw new VariableResolutionError(
                `Entry '${entry.template}' sets '${key}' from \${${ref}}, ` +
                  "which this composite does not declare",
              );
            }
            return resolved[ref];
          });
        } else {
          entryValues[key] = val;
        }
      }
    }

    try {
      const { manifest: tmplManifest, files } = await source.fetchTemplate(entry.template);
      const result = renderTemplate(tmplManifest, files, entryValues);

      // Prefix paths for non-root entries. `entry.path` comes from the
      // composite manifest, which the schema types as a plain string, so the
      // prefix is a second way a path can leave the output directory — one the
      // per-template check cannot see, because it runs before the prefix is
      // applied. The prefixed result is what gets written, so that is what is
      // checked.
      const prefix = entry.root ? "" : entry.path ? entry.path + "/" : "";
      for (const file of result.files) {
        const prefixedPath = prefix + file.path;
        assertDescendingPath(prefixedPath, `Composed path for entry '${entry.template}'`);
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
      // A path that escapes is not a per-entry failure to carry on from. The
      // rest of this catch exists so one unreachable template does not lose the
      // whole scaffold, and that trade is only sound while the failure is
      // confined to the entry that caused it. A refused path is a claim about
      // where files land, so it propagates to the caller instead.
      if (err instanceof PathContainmentError) throw err;
      warnings.push(
        `Failed to render entry '${entry.template}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { files: allFiles, warnings, hooks: allHooks, entries };
}
