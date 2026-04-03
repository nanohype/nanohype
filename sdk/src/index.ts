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
export { validateManifest, validateCompositeManifest } from './validator.js';
export { resolveVariables } from './resolver.js';
export { renderTemplate } from './renderer.js';
export { renderComposite } from './composite.js';
