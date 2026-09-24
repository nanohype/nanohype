// Types

// Platform Reference loaders
export { loadCatalog } from "./catalog.js";
export { renderComposite } from "./composite.js";
export {
  CONTRACT_REPOS,
  isContractRepo,
  KNOWN_CONTRACT_REPOS,
  loadAllContracts,
  loadContract,
} from "./contracts.js";
// Errors
export { ManifestValidationError, NanohypeError, VariableResolutionError } from "./errors.js";
export { assertDescendingPath, PathContainmentError, resolveWithin } from "./paths.js";
export { renderTemplate } from "./renderer.js";
export { resolveVariables } from "./resolver.js";
export type { CatalogSource, GitHubSourceOptions, LocalSourceOptions } from "./source.js";
// Sources
export { GitHubSource } from "./sources/github.js";
export { LocalSource } from "./sources/local.js";
export {
  isStandardName,
  loadStandard,
  loadStandards,
  QUALITY_DIMENSIONS,
  STANDARD_NAMES,
} from "./standards.js";
export type {
  AgentAccessStandard,
  AgentFetcher,
  AgentFetcherClass,
  // Platform Reference types
  Catalog,
  CatalogComposite,
  CatalogEntry,
  CatalogTemplate,
  CompositeCatalogEntry,
  CompositeEntry,
  CompositeManifest,
  CompositeRenderResult,
  Contract,
  ContractRepo,
  ContractRepoInfo,
  DocumentationVoiceStandard,
  LanguageToolchainStandard,
  LLMPolicyStandard,
  ObservabilitySloStandard,
  PlatformTenantContractStandard,
  QualityDimension,
  QualityRubricDimensionsStandard,
  RenderResult,
  RepoVisibility,
  ResourceNamingStandard,
  ResourceTaggingStandard,
  SeoBaselineStandard,
  Severity,
  SkeletonFile,
  Standard,
  StandardEnvelope,
  StandardName,
  StandardRule,
  Standards,
  TelemetryPipelineStandard,
  TemplateConditional,
  TemplateHook,
  TemplateManifest,
  TemplatePrerequisite,
  TemplateVariable,
  TestingRubricStandard,
  Toolchain,
  VersionCurrencyStandard,
} from "./types.js";
// Functions
export {
  CATALOG_NAME_PATTERN,
  isCatalogName,
  validateCompositeManifest,
  validateManifest,
} from "./validator.js";
