import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFile } from "fs/promises";
import { loadPrompt, renderPrompt, validatePrompt } from "../index.js";
import type { Prompt, PromptMetadata } from "../types.js";

vi.mock("fs/promises", async () => {
  const actual = await vi.importActual<typeof import("fs/promises")>("fs/promises");
  return {
    ...actual,
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
  };
});

const samplePrompt = `---
name: test-prompt
version: 1.0.0
model: claude-sonnet-4-20250514
variables:
  - name: topic
    description: The topic to write about
    required: true
  - name: tone
    description: Writing tone
    required: false
    default: professional
---
Write a {{tone}} article about {{topic}}.`;

const schemaContent = JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["name", "version"],
  additionalProperties: true,
  properties: {
    name: { type: "string" },
    version: { type: "string" },
    model: { type: "string" },
    temperature: { type: "number" },
    max_tokens: { type: "integer" },
    tags: { type: "array", items: { type: "string" } },
    variables: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "description"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          required: { type: "boolean" },
          default: { type: "string" },
        },
      },
    },
  },
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadPrompt", () => {
  it("parses YAML frontmatter and returns metadata with template", async () => {
    const mockReadFile = vi.mocked(readFile);
    mockReadFile.mockImplementation(async (path: any) => {
      if (String(path).endsWith(".json")) return schemaContent;
      return samplePrompt;
    });

    const prompt = await loadPrompt("/prompts/test.yaml", "/schema/prompt.schema.json");

    expect(prompt.metadata.name).toBe("test-prompt");
    expect(prompt.metadata.version).toBe("1.0.0");
    expect(prompt.metadata.model).toBe("claude-sonnet-4-20250514");
    expect(prompt.metadata.variables).toHaveLength(2);
    expect(prompt.template).toBe("Write a {{tone}} article about {{topic}}.");
  });
});

describe("renderPrompt", () => {
  const prompt: Prompt = {
    metadata: {
      name: "test-prompt",
      version: "1.0.0",
      variables: [
        { name: "topic", description: "The topic", required: true },
        { name: "tone", description: "The tone", required: false, default: "professional" },
      ],
    },
    template: "Write a {{tone}} article about {{topic}}.",
    filePath: "/prompts/test.yaml",
  };

  it("substitutes provided variables into the template", () => {
    const result = renderPrompt(prompt, { topic: "AI safety", tone: "casual" });
    expect(result.content).toBe("Write a casual article about AI safety.");
  });

  it("uses default values when variables are not provided", () => {
    const result = renderPrompt(prompt, { topic: "AI safety" });
    expect(result.content).toBe("Write a professional article about AI safety.");
  });

  it("throws when a required variable is missing", () => {
    expect(() => renderPrompt(prompt, {})).toThrow('Missing required variable "topic"');
  });
});

describe("validatePrompt", () => {
  it("passes for valid metadata", async () => {
    const mockReadFile = vi.mocked(readFile);
    mockReadFile.mockResolvedValue(schemaContent as any);

    const metadata: PromptMetadata = { name: "valid-prompt", version: "1.0.0" };
    await expect(validatePrompt(metadata, "/schema/prompt.schema.json")).resolves.toBeUndefined();
  });

  it("throws for metadata missing required fields", async () => {
    const mockReadFile = vi.mocked(readFile);
    mockReadFile.mockResolvedValue(schemaContent as any);

    const metadata = { name: "no-version" } as PromptMetadata;
    await expect(
      validatePrompt(metadata, "/schema/prompt.schema.json")
    ).rejects.toThrow("Prompt validation failed");
  });
});
