import type { QUALITY_DIMENSIONS } from "./standards.js";

export interface TemplateVariable {
  name: string;
  type: "string" | "bool" | "enum" | "int";
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
  kind?: "template" | "brief";
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
  kind: "composite";
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
  | "nanohype"
  | "landing-zone"
  | "eks-gitops"
  | "eks-agent-platform"
  | "kx"
  | "cloudgov"
  | "fab"
  | "portal"
  | "eks-fleet";

/** Whether a contract repo is publicly readable or needs an authenticated token. */
export type RepoVisibility = "public" | "private";

/** A contract repo plus its visibility — the descriptor the loader resolves against. */
export interface ContractRepoInfo {
  repo: ContractRepo;
  visibility: RepoVisibility;
}

/** One entry in catalog.json's `templates` array — a single template's discovery metadata. */
export interface CatalogTemplate {
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: string;
  persona?: string[];
  tags: string[];
  kind: "template" | "brief";
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
  kind: "nanohype/catalog";
  version: string;
  generated_at: string;
  templates: CatalogTemplate[];
  composites: CatalogComposite[];
}

/** Names of the published standards files (matches `standards/<name>.json` minus the .json). */
export type StandardName =
  | "language-toolchain"
  | "version-currency"
  | "platform-tenant-contract"
  | "llm-policy"
  | "quality-rubric-dimensions"
  | "testing-rubric"
  | "resource-tagging"
  | "resource-naming"
  | "observability-slo"
  | "telemetry-pipeline"
  | "seo-baseline"
  | "documentation-voice"
  | "agent-access";

/** A quality dimension id, as published in `standards/quality-rubric-dimensions.json`. */
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

/** `reject`: a violation fails the standard. `warn`: a violation is a finding that does not fail it. */
export type Severity = "reject" | "warn";

/** One rule a standard states, with the severity a violation carries. */
export interface StandardRule {
  id: string;
  summary: string;
  severity: Severity;
  /** The dimensions this rule is graded on, when narrower than its standard's `grades`. */
  grades?: QualityDimension[];
}

/** The fields every standards file carries beside its `kind` and `content`. */
export interface StandardEnvelope {
  version: string;
  title: string;
  summary: string;
  /** The deliverables the standard governs, with any stack scoping. A grader reads it to decide applies or N/A. */
  applies_to: string;
  /** The quality dimensions a violation is graded on. Empty only for quality-rubric-dimensions. */
  grades: QualityDimension[];
}

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
export interface LanguageToolchainStandard extends StandardEnvelope {
  kind: "nanohype/standards/language-toolchain";
  content: {
    /**
     * The keys of a `Toolchain` that hold a runnable command, in the order a
     * repository runs them. A consumer dispatching phases reads this rather
     * than carrying its own list, so a phase published here reaches every
     * consumer and one retired here leaves them all.
     */
    phases: string[];
    toolchains: Record<string, Toolchain>;
  };
}

/** Standards file: version currency policy. */
export interface VersionCurrencyStandard extends StandardEnvelope {
  kind: "nanohype/standards/version-currency";
  content: {
    rules: StandardRule[];
    registries: Record<string, string>;
    accepted_pin_reasons: string[];
  };
}

/** Standards file: platform-tenant contract. */
export interface PlatformTenantContractStandard extends StandardEnvelope {
  kind: "nanohype/standards/platform-tenant-contract";
  content: {
    required_artifacts: { path: string; description: string }[];
    platform_cr_shape: Record<string, unknown>;
    otel_resource_attrs: {
      name: string;
      required: boolean;
      description: string;
    }[];
    rules: StandardRule[];
  };
}

/** Standards file: LLM policy. */
export interface LLMPolicyStandard extends StandardEnvelope {
  kind: "nanohype/standards/llm-policy";
  content: {
    primary_provider: string;
    models: { default: string; escalation: string; light: string };
    regions_preferred: string[];
    sdk_by_language: Record<string, string>;
    /** A requirement that declares no severity is read as `warn`. */
    requirements: { id: string; summary: string; severity?: Severity }[];
  };
}

/** Standards file: the quality-rubric dimension names and summaries every other standard's `grades` draws from. */
export interface QualityRubricDimensionsStandard extends StandardEnvelope {
  kind: "nanohype/standards/quality-rubric-dimensions";
  content: {
    dimensions: { id: QualityDimension; name: string; summary: string }[];
  };
}

/** Standards file: testing rubric — the org test baseline (shape, coverage floor, practices). */
export interface TestingRubricStandard extends StandardEnvelope {
  kind: "nanohype/standards/testing-rubric";
  content: {
    shape: string;
    coverage_floor: {
      branches: number;
      lines: number;
      functions: number;
      statements: number;
    };
    rules: StandardRule[];
  };
}

/** One canonical tag/label dimension and how it renders on each surface. A null render means the dimension does not apply to that surface. */
export interface TagDimension {
  id: string;
  tier: "required" | "recommended" | "contextual";
  meaning: string;
  render: {
    aws: string | null;
    k8s: string | null;
    otel: string | null;
  };
}

/** Standards file: resource tagging/labeling taxonomy. The single source of truth for the canonical tag set and its per-surface rendering. */
export interface ResourceTaggingStandard extends StandardEnvelope {
  kind: "nanohype/standards/resource-tagging";
  content: {
    transforms: Record<string, string>;
    reserved_prefixes: {
      k8s: string[];
      otel: string[];
      app_extension: Record<string, string>;
    };
    dimensions: TagDimension[];
    required_by_surface: Record<"aws" | "k8s" | "otel", string[]>;
    /**
     * Tags required only on certain resource kinds, not universally. Each entry names a
     * dimension, the surface + tag it renders as, and the resource kinds it is required on —
     * e.g. BackupPolicy on backup-eligible kinds, without which a resource is silently
     * unprotected. Optional: absent on standards versions predating conditional requirements.
     */
    conditional_requirements?: ConditionalTagRequirement[];
  };
}

/** A tag required only on certain resource kinds (see ResourceTaggingStandard). */
export interface ConditionalTagRequirement {
  dimension: string;
  surface: "aws" | "k8s" | "otel";
  tag: string;
  required_on_kinds: string[];
  value: string;
  rationale: string;
}

/** One SLI definition: the good/valid ratio and its default objective. */
export interface SliType {
  id: string;
  good_over_valid: string;
  default_objective: number;
  default_threshold_seconds?: number;
}

/** One multi-window multi-burn-rate alert pair. */
export interface BurnRateWindow {
  severity: "page" | "ticket";
  long: string;
  short: string;
  factor: number;
  budget_consumed?: string;
}

/** Standards file: observability + SLO bar (RED/USE, golden signals, SLO error-budget burn, dashboard requirements). */
export interface ObservabilitySloStandard extends StandardEnvelope {
  kind: "nanohype/standards/observability-slo";
  content: {
    principles: {
      red: string;
      use: string;
      golden_signals: string[];
      domain_semantics?: string;
      instrumentation?: string;
    };
    slo: {
      definition: string;
      window_days: number;
      sli_types: SliType[];
      error_budget: string;
    };
    burn_rate_alerts: {
      method: string;
      burn_rate_definition?: string;
      windows: BurnRateWindow[];
    };
    recording_rules?: Record<string, string>;
    fleet_alerting?: {
      summary: string;
      severity_tiers: {
        id: "critical" | "warning" | "info";
        intent: "page" | "ticket" | "record";
        topic_suffix?: string;
        examples?: string[];
      }[];
      standard_dimensions: {
        rationale?: string;
        required: string[];
        conditional?: { tag: string; when: string }[];
      };
      composite_rollup: {
        rule: string;
        naming?: string;
        recovery?: string;
      };
    };
    dashboard_requirements: {
      required_rows: { id: string; panels: string[] }[];
      conventions?: Record<string, string>;
    };
    do?: string[];
    do_not?: string[];
  };
}

/** One required or optional file the SEO surface must serve. */
export interface SeoRequiredFile {
  path: string;
  description: string;
}

/** One head tag the Seo component emits, and whether it is required. */
export interface SeoHeadTag {
  id: string;
  required: boolean;
  summary: string;
}

/** Standards file: SEO baseline — canonical apex host, discovery files, head tags, one GSC property per site. */
export interface SeoBaselineStandard extends StandardEnvelope {
  kind: "nanohype/standards/seo-baseline";
  content: {
    canonical_host: {
      rule: "apex" | "www";
      summary: string;
      redirect?: string;
    };
    gsc: {
      property_type: "url-prefix" | "domain";
      property?: string;
      verification: "meta-tag" | "dns-txt" | "html-file";
      summary: string;
    };
    required_files: SeoRequiredFile[];
    head_tags: SeoHeadTag[];
    rules: StandardRule[];
    implementation?: {
      pattern: string;
      summary: string;
      provides: string[];
    };
    do?: string[];
    do_not?: string[];
  };
}

/** Standards file: the resource naming grammar. The single source of truth for how cloud and k8s resources are named on the stack — the env-first cloud / env-token-free k8s domain split, the co-located-sibling cluster-identity model, and the collision + length guards. */
export interface ResourceNamingStandard extends StandardEnvelope {
  kind: "nanohype/standards/resource-naming";
  content: {
    environments: string[];
    domains: {
      id: string;
      applies_to: string;
      rule: string;
      example?: string;
    }[];
    cluster_identity: {
      tuple: string[];
      aws_cluster_name: string;
      cluster_name_rules: string;
      shared_per_environment?: string[];
      per_cluster?: string[];
    };
    transforms: Record<string, string>;
    limits: {
      s3_bucket: number;
      iam_role: number;
      note?: string;
    };
    rules: StandardRule[];
  };
}

/**
 * How telemetry moves: the OTLP collection contract every workload emits
 * against, the floor|full cluster tier that changes only where it lands, the
 * events the platform publishes when telemetry makes it act, and the discovery
 * paths a client resolves those resources from.
 *
 * Companion to `ObservabilitySloStandard`, which owns *what* to measure and when
 * to alert. This owns how the measurements travel and who may read them.
 */
export interface TelemetryPipelineStandard extends StandardEnvelope {
  kind: "nanohype/standards/telemetry-pipeline";
  content: {
    principles: {
      neutral_waist: string;
      one_egress: string;
      absent_is_not_healthy: string;
      cost_is_a_design_input?: string;
    };
    collection_contract: {
      protocol: string;
      /** The stable alias Service every workload targets, never the collector's own name. */
      endpoint: string;
      endpoint_rationale?: string;
      topology: Array<{
        tier: string;
        shape: string;
        owns: string;
        never?: string;
      }>;
      node_scoping?: string;
      workload_requirements: string[];
    };
    tiers: {
      rule: string;
      /** What must NOT vary across tiers — the property the tiering exists to preserve. */
      invariant: string;
      levels: Array<{
        id: string;
        intent: string;
        metrics: string;
        logs: string;
        traces: string;
        requires?: string;
      }>;
      /** A bare tier id, not prose — a client reads this to know what a cluster gets by default. */
      default: string;
      default_rationale?: string;
      unrouted_traces?: string;
    };
    signal_contract: {
      summary: string;
      events: Array<{
        detail_type: string;
        source: string;
        when: string;
        detail_fields: string[];
        severity: string;
      }>;
      rules: StandardRule[];
    };
    discovery: {
      summary: string;
      prefix: string;
      paths: Array<{ path: string; is: string }>;
      absence_is_meaningful?: string;
    };
    do?: string[];
    do_not?: string[];
  };
}

/**
 * Standards file: the prose form of the greenfield doctrine. Governs every
 * surface a human reads — not only markdown — and grades a sentence on whether
 * it helps the reader change the code or only records how the code came to be.
 * Editorial style and structured provenance are delegated to the external
 * authorities in `normative_references`; `rules` carries what neither covers.
 */
export interface DocumentationVoiceStandard extends StandardEnvelope {
  kind: "nanohype/standards/documentation-voice";
  content: {
    scope: { applies_to: string; excluded?: string[] };
    normative_references: {
      id: string;
      title: string;
      resource: string;
      license?: string;
      adopted_for: string;
    }[];
    the_test: string;
    why_it_is_hard?: string;
    /**
     * Rule bodies are heterogeneous by design. A rule refining a cited
     * standard carries `refines` and worked correct/defect pairs; a rule
     * original to this org carries `origin` and the hazards found applying
     * it. Only `id`, `rule` and `severity` are common to every entry.
     */
    rules: {
      id: string;
      rule: string;
      /** Conformance is read rather than matched, so every rule is `warn`. */
      severity: "warn";
      refines?: string;
      origin?: string;
      tell?: string;
      test?: string;
      rationale?: string;
      correct?: string[];
      defect?: string[];
      conversions?: string[];
      identifiers_as_operands?: string;
      precedence?: string;
      protected?: string;
      hazard?: string;
      worked_example?: string;
      propagation?: string;
      note?: string;
      includes?: string;
      runtime_state_exemption?: string;
      most_common_shape?: string;
    }[];
    method: {
      summary: string;
      hazards?: string[];
      enforceable?: string;
      recommended_gate?: string;
      who_audits?: string;
      conformance_is_read?: string;
      scope_of_precedence?: string;
      relay_resolution?: string;
    };
  };
}

/** One fetcher class in the agent-access roster. */
export type AgentFetcherClass = "search-index" | "user-initiated" | "training" | "link-preview";

/** One user-agent token in the agent-access roster, as its operator documents it. */
export interface AgentFetcher {
  /** The product token robots.txt names and the fetcher sends; matched case-insensitively. */
  token: string;
  operator: string;
  class: AgentFetcherClass;
  /** False where the operator documents that the fetcher may ignore robots.txt. */
  honors_robots: boolean;
  /** The operator's page documenting the token. */
  docs: string;
  note?: string;
}

/**
 * Standards file: which AI agents and search crawlers a public deliverable
 * admits. The roster classifies each fetcher; the rules keep robots.txt and the
 * edge open to the search-index and user-initiated classes, and `probe` is the
 * live reachability check a client runs against a deployed site.
 */
export interface AgentAccessStandard extends StandardEnvelope {
  kind: "nanohype/standards/agent-access";
  content: {
    classes: Record<AgentFetcherClass, string>;
    agent_fetchers: AgentFetcher[];
    probe: {
      method: "GET";
      paths: string[];
      /** The classes whose tokens the probe sends. */
      classes: AgentFetcherClass[];
      expect: string;
    };
    rules: StandardRule[];
  };
}

/** Union of every published standard. Discriminated by `kind`. */
export type Standard =
  | LanguageToolchainStandard
  | VersionCurrencyStandard
  | PlatformTenantContractStandard
  | LLMPolicyStandard
  | QualityRubricDimensionsStandard
  | TestingRubricStandard
  | ResourceTaggingStandard
  | ResourceNamingStandard
  | ObservabilitySloStandard
  | TelemetryPipelineStandard
  | SeoBaselineStandard
  | DocumentationVoiceStandard
  | AgentAccessStandard;

/**
 * Parsed bundle of every published standard. The shape an external client
 * gets from `loadStandards(source)` — one named slot per standard, each
 * checked for its `kind` on load. Schema validation of the files is this
 * repository's CI gate (`npm run validate:standards`).
 */
export interface Standards {
  "language-toolchain": LanguageToolchainStandard;
  "version-currency": VersionCurrencyStandard;
  "platform-tenant-contract": PlatformTenantContractStandard;
  "llm-policy": LLMPolicyStandard;
  "quality-rubric-dimensions": QualityRubricDimensionsStandard;
  "testing-rubric": TestingRubricStandard;
  "resource-tagging": ResourceTaggingStandard;
  "resource-naming": ResourceNamingStandard;
  "observability-slo": ObservabilitySloStandard;
  "telemetry-pipeline": TelemetryPipelineStandard;
  "seo-baseline": SeoBaselineStandard;
  "documentation-voice": DocumentationVoiceStandard;
  "agent-access": AgentAccessStandard;
}

/** The raw markdown content of a supporting repo's AGENTS.md. */
export interface Contract {
  repo: ContractRepo;
  content: string;
  /** Stamped from the repo descriptor so consumers can label without a second lookup. */
  visibility?: RepoVisibility;
}
