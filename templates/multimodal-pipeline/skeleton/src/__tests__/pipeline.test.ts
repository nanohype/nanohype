/**
 * Tests for the pipeline orchestrator.
 *
 * Verifies modality detection, and that the pipeline builds one analysis
 * provider for each loaded configuration rather than one per input, so the
 * provider's circuit breaker sees every request that configuration makes.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { analyzeProcessed, detectModality } from "../pipeline.js";
import type { ProcessedInput } from "../processors/types.js";
import { getProvider, registerProvider } from "../providers/registry.js";

describe("detectModality", () => {
  it("detects image MIME types", () => {
    expect(detectModality("image/jpeg")).toBe("image");
    expect(detectModality("image/png")).toBe("image");
    expect(detectModality("image/gif")).toBe("image");
    expect(detectModality("image/webp")).toBe("image");
    expect(detectModality("image/svg+xml")).toBe("image");
  });

  it("detects audio MIME types", () => {
    expect(detectModality("audio/mpeg")).toBe("audio");
    expect(detectModality("audio/wav")).toBe("audio");
    expect(detectModality("audio/ogg")).toBe("audio");
    expect(detectModality("audio/flac")).toBe("audio");
  });

  it("detects video MIME types", () => {
    expect(detectModality("video/mp4")).toBe("video");
    expect(detectModality("video/webm")).toBe("video");
    expect(detectModality("video/quicktime")).toBe("video");
  });

  it("throws on unsupported MIME types", () => {
    expect(() => detectModality("application/json")).toThrow("Unsupported MIME type");
    expect(() => detectModality("text/plain")).toThrow("Unsupported MIME type");
  });
});

describe("analysis provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is built once for each loaded configuration, however many inputs it analyzes", async () => {
    let built = 0;
    registerProvider("test-counting", () => {
      built += 1;
      return getProvider("mock");
    });
    vi.stubEnv("LLM_PROVIDER", "test-counting");
    const transcript: ProcessedInput = {
      modality: "audio",
      mimeType: "audio/mpeg",
      source: "meeting.mp3",
      text: "Hello and welcome.",
      metadata: {},
    };
    const config = loadConfig();

    await analyzeProcessed(transcript, config);
    await analyzeProcessed(transcript, config);
    expect(built).toBe(1);

    await analyzeProcessed(transcript, loadConfig());
    expect(built).toBe(2);
  });
});
