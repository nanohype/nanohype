// Types
export type {
  TemplateVariable,
  TemplateConditional,
  TemplateHook,
  TemplatePrerequisite,
  TemplateManifest,
  SkeletonFile,
  CatalogEntry,
  RenderResult,
  CompositeEntry,
  CompositeManifest,
  CompositeCatalogEntry,
  CompositeRenderResult,
  // Platform Reference types
  Catalog,
  CatalogTemplate,
  CatalogComposite,
  Contract,
  ContractRepo,
  ContractRepoInfo,
  RepoVisibility,
  LanguageToolchainStandard,
  LLMPolicyStandard,
  PlatformTenantContractStandard,
  QualityRubricDimensionsStandard,
  Standard,
  StandardName,
  Standards,
  Toolchain,
  VersionCurrencyStandard,
} from './types.js';

export type {
  CatalogSource,
  GitHubSourceOptions,
  LocalSourceOptions,
} from './source.js';

// Sources
export { GitHubSource } from './sources/github.js';
export { LocalSource } from './sources/local.js';

// Errors
export {
  NanohypeError,
  ManifestValidationError,
  VariableResolutionError,
} from './errors.js';

// Functions
export {
  CATALOG_NAME_PATTERN,
  isCatalogName,
  validateManifest,
  validateCompositeManifest,
} from './validator.js';
export { resolveVariables } from './resolver.js';
export { renderTemplate } from './renderer.js';
export { renderComposite } from './composite.js';

// Platform Reference loaders
export { loadCatalog } from './catalog.js';
export { isStandardName, loadStandard, loadStandards, STANDARD_NAMES } from './standards.js';
export {
  isContractRepo,
  loadContract,
  loadAllContracts,
  KNOWN_CONTRACT_REPOS,
  CONTRACT_REPOS,
} from './contracts.js';
