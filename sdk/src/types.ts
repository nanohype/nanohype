export interface TemplateVariable {
  name: string;
  type: 'string' | 'bool' | 'enum' | 'int';
  placeholder: string;
  description: string;
  prompt?: string;
  default?: string | boolean | number;
  required?: boolean;
  validation?: { pattern?: string; message?: string };
  options?: string[];
}

export interface TemplateConditional {
  path: string;
  when: string;
}

export interface TemplateHook {
  name: string;
  description: string;
  run: string;
  workdir?: string;
}

export interface TemplatePrerequisite {
  name: string;
  version?: string;
  purpose: string;
  optional?: boolean;
}

export interface TemplateManifest {
  apiVersion: string;
  kind?: 'template' | 'brief';
  name: string;
  displayName: string;
  description: string;
  version: string;
  license?: string;
  persona?: string[];
  category?: string;
  tags: string[];
  variables: TemplateVariable[];
  conditionals?: TemplateConditional[];
  hooks?: { pre?: TemplateHook[]; post?: TemplateHook[] };
  composition?: { pairsWith?: string[]; nestsInside?: string[] };
  prerequisites?: TemplatePrerequisite[];
}

export interface SkeletonFile {
  path: string;
  content: string;
}

export interface CatalogEntry {
  name: string;
  displayName: string;
  description: string;
  version: string;
  kind?: string;
  persona?: string[];
  category?: string;
  tags: string[];
}

export interface RenderResult {
  files: SkeletonFile[];
  warnings: string[];
  hooks: { pre: TemplateHook[]; post: TemplateHook[] };
}

export interface CompositeEntry {
  template: string;
  path?: string;
  root?: boolean;
  variables?: Record<string, string | boolean | number>;
  condition?: string;
}

export interface CompositeManifest {
  apiVersion: string;
  kind: 'composite';
  name: string;
  displayName: string;
  description: string;
  version: string;
  tags: string[];
  variables: TemplateVariable[];
  templates: CompositeEntry[];
}

export interface CompositeCatalogEntry {
  name: string;
  displayName: string;
  description: string;
  version: string;
  tags: string[];
  templateCount: number;
}

export interface CompositeRenderResult {
  files: SkeletonFile[];
  warnings: string[];
  hooks: { pre: TemplateHook[]; post: TemplateHook[] };
  entries: { template: string; path?: string; fileCount: number }[];
}

// ── Platform Reference: catalog + standards + contracts ─────────────
//
// These types describe the machine-readable surface published in the
// nanohype repo under `catalog.json`, `standards/*.json`, and per-repo
// `AGENTS.md`. They mirror the JSON shapes validated by
// `schemas/catalog.schema.json` and `schemas/standards.schema.json`.

/** Stable kind discriminator for a supporting repo's agent-facing contract. */
export type ContractRepo =
  | 'nanohype'
  | 'landing-zone'
  | 'eks-gitops'
  | 'aks-gitops'
  | 'eks-agent-platform'
  | 'kx';

/** One entry in catalog.json's `templates` array — a single template's discovery metadata. */
export interface CatalogTemplate {
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: string;
  persona?: string[];
  tags: string[];
  kind: 'template' | 'brief';
  path: string;
}

/** One entry in catalog.json's `composites` array — a single composite's discovery metadata. */
export interface CatalogComposite {
  name: string;
  displayName: string;
  description: string;
  version: string;
  tags: string[];
  path: string;
}

/** Parsed catalog.json. The top-level discovery surface for external clients. */
export interface Catalog {
  kind: 'nanohype/catalog';
  version: string;
  generated_at: string;
  templates: CatalogTemplate[];
  composites: CatalogComposite[];
}

/** Names of the published standards files (matches `standards/<name>.json` minus the .json). */
export type StandardName =
  | 'language-toolchain'
  | 'version-currency'
  | 'platform-tenant-contract'
  | 'llm-policy'
  | 'quality-rubric-dimensions';

/** Per-language toolchain: install + four-phase commands + manifest/registry metadata. */
export interface Toolchain {
  install: string;
  build: string;
  lint: string;
  test: string;
  docs: string;
  typecheck?: string;
  lockfile: string;
  manifest: string;
  registry: string;
  versionLookup: string;
}

/** Standards file: language toolchain. */
export interface LanguageToolchainStandard {
  kind: 'nanohype/standards/language-toolchain';
  version: string;
  title: string;
  summary: string;
  content: {
    toolchains: Record<string, Toolchain>;
  };
}

/** Standards file: version currency policy. */
export interface VersionCurrencyStandard {
  kind: 'nanohype/standards/version-currency';
  version: string;
  title: string;
  summary: string;
  content: {
    rules: { id: string; summary: string; severity?: 'reject' | 'warn' }[];
    registries: Record<string, string>;
    accepted_pin_reasons: string[];
  };
}

/** Standards file: platform-tenant contract. */
export interface PlatformTenantContractStandard {
  kind: 'nanohype/standards/platform-tenant-contract';
  version: string;
  title: string;
  summary: string;
  content: {
    required_artifacts: { path: string; description: string }[];
    platform_cr_shape: Record<string, unknown>;
    otel_resource_attrs: { name: string; required: boolean; description: string }[];
    do_not: string[];
  };
}

/** Standards file: LLM policy. */
export interface LLMPolicyStandard {
  kind: 'nanohype/standards/llm-policy';
  version: string;
  title: string;
  summary: string;
  content: {
    primary_provider: string;
    models: { default: string; escalation: string; light: string };
    regions_preferred: string[];
    sdk_by_language: Record<string, string>;
    requirements: { id: string; summary: string }[];
  };
}

/** Standards file: quality-rubric dimension names (depth — weights, assignments, REJECT criteria — stays private). */
export interface QualityRubricDimensionsStandard {
  kind: 'nanohype/standards/quality-rubric-dimensions';
  version: string;
  title: string;
  summary: string;
  content: {
    dimensions: { id: string; name: string; summary: string }[];
  };
}

/** Union of every published standard. Discriminated by `kind`. */
export type Standard =
  | LanguageToolchainStandard
  | VersionCurrencyStandard
  | PlatformTenantContractStandard
  | LLMPolicyStandard
  | QualityRubricDimensionsStandard;

/**
 * Parsed bundle of every published standard. The shape an external client
 * gets from `loadStandards(source)` — one named slot per standard, all
 * already validated against the schema by the SDK.
 */
export interface Standards {
  'language-toolchain': LanguageToolchainStandard;
  'version-currency': VersionCurrencyStandard;
  'platform-tenant-contract': PlatformTenantContractStandard;
  'llm-policy': LLMPolicyStandard;
  'quality-rubric-dimensions': QualityRubricDimensionsStandard;
}

/** The raw markdown content of a supporting repo's AGENTS.md. */
export interface Contract {
  repo: ContractRepo;
  content: string;
}
