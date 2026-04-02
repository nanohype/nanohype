import { readFile, readdir, stat } from "fs/promises";
import { join, resolve } from "path";
import { parse as parseYaml } from "yaml";
import Ajv from "ajv";

import type { Prompt, PromptMetadata, RenderedPrompt } from "./types.js";

// Re-export types for consumer convenience
export type { Prompt, PromptMetadata, PromptVariable, RenderedPrompt } from "./types.js";

/**
 * Load and parse the prompt JSON Schema from disk.
 */
async function loadSchema(schemaPath?: string): Promise<object> {
  const resolved = schemaPath ?? resolve(import.meta.dirname, "../../schema/prompt.schema.json");
  const raw = await readFile(resolved, "utf-8");
  return JSON.parse(raw);
}

/**
 * Parse YAML frontmatter delimited by `---` markers.
 * Returns the parsed metadata object and the template body.
 */
function parseFrontmatter(content: string): { metadata: PromptMetadata; template: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid prompt file: missing YAML frontmatter delimited by ---");
  }
  const metadata = parseYaml(match[1]) as PromptMetadata;
  const template = match[2].trim();
  return { metadata, template };
}

/**
 * Load a single prompt from a YAML file.
 *
 * Reads the file, parses frontmatter, and validates the metadata against
 * the prompt JSON Schema.
 */
export async function loadPrompt(filePath: string, schemaPath?: string): Promise<Prompt> {
  const content = await readFile(filePath, "utf-8");
  const { metadata, template } = parseFrontmatter(content);

  await validatePrompt(metadata, schemaPath);

  return { metadata, template, filePath };
}

/**
 * Recursively load all `.yaml` and `.yml` prompt files from a directory.
 */
export async function loadPrompts(directory: string, schemaPath?: string): Promise<Prompt[]> {
  const prompts: Prompt[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await loadPrompts(fullPath, schemaPath);
      prompts.push(...nested);
    } else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
      const prompt = await loadPrompt(fullPath, schemaPath);
      prompts.push(prompt);
    }
  }

  return prompts;
}

/**
 * Render a prompt by substituting `{{variable}}` placeholders with the
 * provided values.
 *
 * This is the prompt runtime variable system — distinct from the scaffold
 * template placeholder system (`__PLACEHOLDER__`) used during project
 * generation.
 *
 * Throws if a required variable is missing and has no default.
 */
export function renderPrompt(
  prompt: Prompt,
  variables: Record<string, string> = {}
): RenderedPrompt {
  const vars = prompt.metadata.variables ?? [];

  // Validate that all required variables are present
  for (const v of vars) {
    if (v.required && !(v.name in variables) && v.default === undefined) {
      throw new Error(
        `Missing required variable "${v.name}" for prompt "${prompt.metadata.name}"`
      );
    }
  }

  // Build resolved variable map: provided values > defaults > empty string
  const resolved: Record<string, string> = {};
  for (const v of vars) {
    resolved[v.name] = variables[v.name] ?? v.default ?? "";
  }

  // Substitute {{variable}} placeholders in the template
  let content = prompt.template;
  for (const [name, value] of Object.entries(resolved)) {
    content = content.replaceAll(`{{${name}}}`, value);
  }

  return {
    metadata: prompt.metadata,
    content,
    filePath: prompt.filePath,
  };
}

/**
 * Find a prompt by its `name` frontmatter field within a directory.
 * Returns the first match or `undefined` if not found.
 */
export async function getPromptByName(
  directory: string,
  name: string,
  schemaPath?: string
): Promise<Prompt | undefined> {
  const prompts = await loadPrompts(directory, schemaPath);
  return prompts.find((p) => p.metadata.name === name);
}

/**
 * Validate prompt metadata against the JSON Schema.
 * Throws an error with details if validation fails.
 */
export async function validatePrompt(
  metadata: PromptMetadata,
  schemaPath?: string
): Promise<void> {
  const schema = await loadSchema(schemaPath);
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  if (!validate(metadata)) {
    const errors = validate.errors
      ?.map((e) => `  ${e.instancePath || "/"}: ${e.message}`)
      .join("\n");
    throw new Error(`Prompt validation failed:\n${errors}`);
  }
}
