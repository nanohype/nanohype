# @nanohype/sdk

Reference implementation of the nanohype template rendering contract. Scaffolding tools use this SDK to discover, validate, and render templates and composites from the catalog.

## Install

```bash
npm install @nanohype/sdk
```

## Sources

Templates live in a catalog — either a GitHub repository or a local directory. Sources abstract discovery and fetching behind a common `CatalogSource` interface.

### GitHubSource

Reads templates from a GitHub repository via the GitHub API. Supports optional authentication and in-memory TTL caching.

```ts
import { GitHubSource } from '@nanohype/sdk';

const source = new GitHubSource({
  repo: 'nanohype/nanohype',   // default
  ref: 'main',                  // default
  token: process.env.GITHUB_TOKEN, // optional, for rate limits
  cacheTtl: 5 * 60 * 1000,     // 5 minutes, default
});

// List all templates in the catalog
const templates = await source.listTemplates();
// => CatalogEntry[] — { name, displayName, description, version, tags }

// Fetch a single template (manifest + skeleton files)
const { manifest, files } = await source.fetchTemplate('agentic-loop');

// List all composites
const composites = await source.listComposites();
// => CompositeCatalogEntry[] — { name, displayName, description, version, tags, templateCount }

// Fetch a composite manifest
const composite = await source.fetchComposite('ai-chatbot');
```

### LocalSource

Reads templates from a local filesystem directory. Expects the standard nanohype layout (`templates/`, `composites/`, `schemas/`). No caching — filesystem reads are fast and caching causes stale results during development.

```ts
import { LocalSource } from '@nanohype/sdk';

const source = new LocalSource({ rootDir: './nanohype' });

const templates = await source.listTemplates();
const { manifest, files } = await source.fetchTemplate('ts-service');
```

Both sources implement the `CatalogSource` interface:

```ts
interface CatalogSource {
  listTemplates(): Promise<CatalogEntry[]>;
  fetchTemplate(name: string): Promise<{ manifest: TemplateManifest; files: SkeletonFile[] }>;
  listComposites(): Promise<CompositeCatalogEntry[]>;
  fetchComposite(name: string): Promise<CompositeManifest>;
}
```

## Rendering

### Single template

Fetch a template, then render it with variable values. The renderer implements the nanohype 10-step scaffolding algorithm: validate manifest, resolve variables (defaults, cross-references, enum/pattern validation), evaluate conditionals, replace placeholders in file paths and content.

```ts
import { LocalSource, renderTemplate } from '@nanohype/sdk';

const source = new LocalSource({ rootDir: './nanohype' });
const { manifest, files } = await source.fetchTemplate('agentic-loop');

const result = renderTemplate(manifest, files, {
  ProjectName: 'my-agent',
  IncludeDocker: true,
  LlmProvider: 'anthropic',
});

// result.files     — SkeletonFile[] with rendered paths and content
// result.warnings  — prerequisite notices, validation notes
// result.hooks     — { pre: TemplateHook[], post: TemplateHook[] } to execute
```

Hooks are returned but not executed — the consumer decides how and whether to run them.

### Composite

Composites render multiple templates into a merged file tree. Each entry can specify a subdirectory path, variable overrides, and a condition for conditional inclusion.

```ts
import { LocalSource, renderComposite } from '@nanohype/sdk';

const source = new LocalSource({ rootDir: './nanohype' });
const composite = await source.fetchComposite('ai-chatbot');

const result = await renderComposite(composite, {
  ProjectName: 'my-bot',
  IncludeAuth: true,
}, source);

// result.files    — merged SkeletonFile[] from all included templates
// result.warnings — file collisions, prerequisite notices
// result.hooks    — aggregated hooks from all templates
// result.entries  — { template, path, fileCount }[] for each rendered template
```

## Validation

Validate manifest structure before rendering. Both functions throw `ManifestValidationError` on the first violation found.

```ts
import { validateManifest, validateCompositeManifest } from '@nanohype/sdk';

// Validates: apiVersion, enum options, conditional references, placeholder uniqueness
validateManifest(templateManifest);

// Validates: apiVersion, kind
validateCompositeManifest(compositeManifest);
```

## Variable Resolution

Resolve variable values independently from rendering. Applies provided values, fills defaults, expands `${VarName}` cross-references, and validates enum membership and regex patterns.

```ts
import { resolveVariables } from '@nanohype/sdk';

const resolved = resolveVariables(manifest.variables, {
  ProjectName: 'my-project',
  // Port omitted — uses default from manifest
});

// resolved — Record<string, string> with all variables fully resolved
```

Throws `VariableResolutionError` on missing required values, circular references, invalid enum choices, or pattern mismatches.

## Types

Key interfaces exported from `@nanohype/sdk`:

| Type | Description |
|---|---|
| `TemplateManifest` | Parsed `template.yaml` — metadata, variables, conditionals, hooks, prerequisites, composition hints |
| `TemplateVariable` | Variable declaration — name, type (`string`, `bool`, `enum`, `int`), placeholder, default, validation |
| `SkeletonFile` | A file in the skeleton tree — `{ path, content }` |
| `CatalogEntry` | Summary of a template for listing — name, displayName, description, version, tags |
| `RenderResult` | Output of `renderTemplate` — rendered files, warnings, hooks |
| `CompositeManifest` | Parsed composite YAML — variables, template entries with conditions and path overrides |
| `CompositeEntry` | A single template reference within a composite — template name, path, root flag, variables, condition |
| `CompositeCatalogEntry` | Summary of a composite for listing — includes `templateCount` |
| `CompositeRenderResult` | Output of `renderComposite` — merged files, warnings, hooks, per-entry metadata |
| `CatalogSource` | Interface for template/composite discovery and fetching |
| `GitHubSourceOptions` | Constructor options for `GitHubSource` — repo, ref, token, cacheTtl |
| `LocalSourceOptions` | Constructor options for `LocalSource` — rootDir |

## Errors

All SDK errors extend `NanohypeError`:

| Error | Thrown by |
|---|---|
| `NanohypeError` | Base class — source fetch failures, unsupported API versions |
| `ManifestValidationError` | `validateManifest`, `validateCompositeManifest` — structural violations |
| `VariableResolutionError` | `resolveVariables`, `renderTemplate`, `renderComposite` — missing values, bad types, circular refs |

## License

[Apache 2.0](../LICENSE)
