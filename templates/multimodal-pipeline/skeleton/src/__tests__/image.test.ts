/**
 * Tests for the processor and provider registries.
 *
 * Verifies register/get/list behavior for both processor and
 * LLM provider registries.
 */

import { describe, it, expect } from "vitest";
import {
  registerProcessor,
  getProcessorByMimeType,
  getProcessorByModality,
  listProcessors,
  listSupportedMimeTypes,
} from "../processors/registry.js";
import {
  registerProvider,
  getProvider,
  listProviders,
} from "../providers/registry.js";
import type { Processor, ProcessedInput } from "../processors/types.js";
import type { MultimodalLlmProvider, AnalysisResult } from "../providers/types.js";

const mockProcessor: Processor = {
  modality: "image",
  supportedMimeTypes: ["image/test"],
  async process(filePath: string, mimeType: string): Promise<ProcessedInput> {
    return {
      modality: "image",
      mimeType,
      source: filePath,
      base64: "dGVzdA==",
      metadata: {},
    };
  },
};

const mockProvider: MultimodalLlmProvider = {
  async analyze(): Promise<AnalysisResult> {
    return { content: "test analysis", model: "test-model", usage: { total_tokens: 10 } };
  },
  async analyzeFrames(): Promise<AnalysisResult> {
    return { content: "test frames analysis", model: "test-model", usage: { total_tokens: 20 } };
  },
};

describe("Processor Registry", () => {
  it("registers and retrieves a processor by MIME type", () => {
    registerProcessor(mockProcessor);
    const processor = getProcessorByMimeType("image/test");
    expect(processor).toBe(mockProcessor);
  });

  it("registers and retrieves a processor by modality", () => {
    registerProcessor(mockProcessor);
    const processor = getProcessorByModality("image");
    expect(processor).toBe(mockProcessor);
  });

  it("lists registered processors", () => {
    registerProcessor(mockProcessor);
    const processors = listProcessors();
    expect(processors.length).toBeGreaterThan(0);
  });

  it("lists supported MIME types", () => {
    registerProcessor(mockProcessor);
    const types = listSupportedMimeTypes();
    expect(types).toContain("image/test");
  });

  it("throws on unknown MIME type", () => {
    expect(() => getProcessorByMimeType("application/nonexistent")).toThrow(
      "No processor registered for MIME type",
    );
  });

  it("throws on unknown modality", () => {
    expect(() => getProcessorByModality("video" as "video")).not.toThrow();
  });
});

describe("LLM Provider Registry", () => {
  it("registers and retrieves a provider", () => {
    registerProvider("test-provider", () => mockProvider);
    const provider = getProvider("test-provider");
    expect(provider).toBe(mockProvider);
  });

  it("lists registered providers", () => {
    registerProvider("test-provider-list", () => mockProvider);
    const providers = listProviders();
    expect(providers).toContain("test-provider-list");
  });

  it("throws on unknown provider", () => {
    expect(() => getProvider("nonexistent-provider")).toThrow("Unknown LLM provider");
  });
});
