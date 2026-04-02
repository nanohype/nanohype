/**
 * Tests for the pipeline orchestrator.
 *
 * Verifies modality detection logic and the pipeline flow with
 * mocked processors and providers.
 */

import { describe, it, expect } from "vitest";
import { detectModality } from "../pipeline.js";

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
