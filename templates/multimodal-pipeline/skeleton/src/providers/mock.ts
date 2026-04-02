/**
 * Mock multimodal LLM provider for local development.
 *
 * Returns canned analysis results without calling any external API.
 * Supports both single-input analysis and multi-frame video analysis.
 * Registers itself as the "mock" provider on import.
 */

import type { MultimodalLlmProvider, AnalysisResult } from "./types.js";
import type { ProcessedInput } from "../processors/types.js";
import { registerProvider } from "./registry.js";

const IMAGE_ANALYSIS: AnalysisResult = {
  content: JSON.stringify({
    description:
      "A photograph showing a well-composed outdoor scene with natural lighting. The foreground contains detailed textures with a softly blurred background creating depth. Colors are warm and saturated, suggesting late afternoon golden-hour conditions.",
    tags: ["photo", "outdoor", "natural-light", "landscape", "golden-hour"],
    objects: ["sky", "vegetation", "ground", "horizon"],
    text: "",
    mood: "calm",
    quality: "high",
  }),
  model: "mock-vision-v1",
  usage: { input_tokens: 1200, output_tokens: 85, total_tokens: 1285 },
};

const AUDIO_ANALYSIS: AnalysisResult = {
  content: JSON.stringify({
    description:
      "Audio recording containing clear speech in English with minimal background noise. The speaker discusses technical concepts with a measured pace and professional tone. Duration appears to be moderate length.",
    tags: ["speech", "english", "technical", "clear-audio"],
    text: "This is a mock transcription of the audio content. The speaker discusses system architecture and design patterns for scalable applications.",
    language: "en",
    confidence: 0.94,
  }),
  model: "mock-vision-v1",
  usage: { input_tokens: 800, output_tokens: 72, total_tokens: 872 },
};

const VIDEO_ANALYSIS: AnalysisResult = {
  content: JSON.stringify({
    description:
      "Video sequence showing a continuous scene with gradual transitions. Motion is detected across frames with consistent lighting conditions. The content appears to be a recorded presentation or demonstration.",
    tags: ["video", "presentation", "indoor", "consistent-lighting"],
    frames_analyzed: 8,
    text: "",
    motion: "moderate",
    scene_changes: 1,
  }),
  model: "mock-vision-v1",
  usage: { input_tokens: 4800, output_tokens: 95, total_tokens: 4895 },
};

class MockVisionProvider implements MultimodalLlmProvider {
  async analyze(
    input: ProcessedInput,
    _systemPrompt: string,
    _model: string,
    _temperature: number,
    _maxTokens: number,
  ): Promise<AnalysisResult> {
    switch (input.modality) {
      case "image":
        return { ...IMAGE_ANALYSIS };
      case "audio":
        return { ...AUDIO_ANALYSIS };
      case "video":
        return { ...VIDEO_ANALYSIS };
      default:
        return { ...IMAGE_ANALYSIS };
    }
  }

  async analyzeFrames(
    frames: string[],
    _systemPrompt: string,
    _model: string,
    _temperature: number,
    _maxTokens: number,
  ): Promise<AnalysisResult> {
    const result = { ...VIDEO_ANALYSIS };
    const parsed = JSON.parse(result.content);
    parsed.frames_analyzed = frames.length;
    result.content = JSON.stringify(parsed);
    result.usage = {
      input_tokens: frames.length * 600,
      output_tokens: 95,
      total_tokens: frames.length * 600 + 95,
    };
    return result;
  }
}

registerProvider("mock", () => new MockVisionProvider());
