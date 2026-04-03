import { resolveVariables } from './resolver.js';
import type { RenderResult, SkeletonFile, TemplateHook, TemplateManifest } from './types.js';
import { validateManifest } from './validator.js';

/**
 * Render a template skeleton with resolved variable values.
 *
 * Implements the nanohype 10-step scaffolding algorithm:
 *   1. Parse (already done — manifest provided)
 *   2. Validate manifest structure
 *   3. Collect variables (provided by caller)
 *   4. Resolve defaults (fill missing, resolve cross-refs)
 *   5. Validate values (required checks, regex patterns)
 *   6. Prerequisites (returned as warnings)
 *   7. Pre-hooks (returned, not executed)
 *   8. Render (placeholder replacement + conditional filtering)
 *   9. Post-hooks (returned, not executed)
 *  10. Done
 */
export function renderTemplate(
  manifest: TemplateManifest,
  files: SkeletonFile[],
  values: Record<string, string | boolean | number>,
): RenderResult {
  const warnings: string[] = [];

  // Steps 2-5: validate manifest + resolve variables
  validateManifest(manifest);
  const resolved = resolveVariables(manifest.variables, values);

  // Step 6: prerequisites (warnings only)
  for (const prereq of manifest.prerequisites ?? []) {
    warnings.push(
      `Prerequisite: ${prereq.name}${prereq.version ? ` ${prereq.version}` : ''} — ${prereq.purpose}${prereq.optional ? ' (optional)' : ''}`,
    );
  }

  // Steps 7, 9: hooks (returned, not executed)
  const hooks: { pre: TemplateHook[]; post: TemplateHook[] } = {
    pre: manifest.hooks?.pre ?? [],
    post: manifest.hooks?.post ?? [],
  };

  // Step 8: render

  // Build conditional exclusion set
  const excludedPaths = new Set<string>();
  for (const cond of manifest.conditionals ?? []) {
    if (resolved[cond.when] === 'false') {
      excludedPaths.add(cond.path);
    }
  }

  const renderedFiles: SkeletonFile[] = [];

  for (const file of files) {
    // Check conditionals — skip excluded files and their children
    const isExcluded = [...excludedPaths].some(
      (exPath) => file.path === exPath || file.path.startsWith(exPath + '/'),
    );
    if (isExcluded) continue;

    // Replace placeholders in path
    let renderedPath = file.path;
    for (const v of manifest.variables) {
      renderedPath = renderedPath.replaceAll(v.placeholder, resolved[v.name]);
    }

    // Replace placeholders in content
    let renderedContent = file.content;
    for (const v of manifest.variables) {
      renderedContent = renderedContent.replaceAll(v.placeholder, resolved[v.name]);
    }

    renderedFiles.push({ path: renderedPath, content: renderedContent });
  }

  return { files: renderedFiles, warnings, hooks };
}
