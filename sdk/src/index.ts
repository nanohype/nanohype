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
export { renderTemplate } from "./renderer.js";
export { resolveVariables } from "./resolver.js";
export type { CatalogSource, GitHubSourceOptions, LocalSourceOptions } from "./source.js";
// Sources
export { GitHubSource } from "./sources/github.js";
export { LocalSource } from "./sources/local.js";
export { isStandardName, loadStandard, loadStandards, STANDARD_NAMES } from "./standards.js";
export type {
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
  LanguageToolchainStandard,
  LLMPolicyStandard,
  PlatformTenantContractStandard,
  QualityRubricDimensionsStandard,
  RenderResult,
  RepoVisibility,
  SkeletonFile,
  Standard,
  StandardName,
  Standards,
  TemplateConditional,
  TemplateHook,
  TemplateManifest,
  TemplatePrerequisite,
  TemplateVariable,
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
