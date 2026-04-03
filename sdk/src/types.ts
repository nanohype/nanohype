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
  name: string;
  displayName: string;
  description: string;
  version: string;
  license?: string;
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
