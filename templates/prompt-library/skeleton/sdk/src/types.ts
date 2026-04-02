/**
 * A single variable declaration from prompt frontmatter.
 */
export interface PromptVariable {
  name: string;
  description: string;
  required?: boolean;
  default?: string;
}

/**
 * Typed representation of prompt YAML frontmatter.
 */
export interface PromptMetadata {
  name: string;
  version: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tags?: string[];
  variables?: PromptVariable[];
}

/**
 * A loaded prompt: parsed frontmatter metadata plus the raw template content.
 * The template content contains {{variable}} placeholders that are resolved
 * at render time — these are NOT scaffold placeholders.
 */
export interface Prompt {
  metadata: PromptMetadata;
  template: string;
  filePath: string;
}

/**
 * A rendered prompt: metadata plus the final content with all {{variable}}
 * placeholders substituted with provided values.
 */
export interface RenderedPrompt {
  metadata: PromptMetadata;
  content: string;
  filePath: string;
}
