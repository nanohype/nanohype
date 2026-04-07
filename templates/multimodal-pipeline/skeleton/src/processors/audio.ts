/**
 * Audio processor.
 *
 * Reads audio files and prepares them for transcription via the
 * registered transcription provider (Whisper by default). The
 * transcribed text is then available for LLM analysis.
 * Registers itself as the "audio" processor on import.
 */

import { stat } from "node:fs/promises";
import type { Processor, ProcessedInput } from "./types.js";
import { registerProcessor } from "./registry.js";
import { getTranscriptionProvider } from "../providers/index.js";
import { loadConfig } from "../config.js";

const SUPPORTED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
];

class AudioProcessor implements Processor {
  readonly modality = "audio" as const;
  readonly supportedMimeTypes = SUPPORTED_MIME_TYPES;

  async process(filePath: string, mimeType: string): Promise<ProcessedInput> {
    const config = loadConfig();
    const apiKey = config.llm.openaiApiKey || process.env.OPENAI_API_KEY;

    const fileInfo = await stat(filePath);
    const fileSizeBytes = fileInfo.size;

    const provider = getTranscriptionProvider("whisper", apiKey);
    const transcription = await provider.transcribe(
      filePath,
      mimeType,
      config.audio.transcriptionModel,
    );

    return {
      modality: "audio",
      mimeType,
      source: filePath,
      text: transcription.text,
      metadata: {
        duration: transcription.duration,
        language: transcription.language,
        model: config.audio.transcriptionModel,
        fileSizeBytes,
      },
    };
  }
}

registerProcessor(new AudioProcessor());
