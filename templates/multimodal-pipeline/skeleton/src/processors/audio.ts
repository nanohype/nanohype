/**
 * Audio processor.
 *
 * Reads audio files and prepares them for transcription via the OpenAI
 * Whisper API. The transcribed text is then available for LLM analysis.
 * Registers itself as the "audio" processor on import.
 */

import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import OpenAI, { toFile } from "openai";
import type { Processor, ProcessedInput } from "./types.js";
import { registerProcessor } from "./registry.js";
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

    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for audio transcription (Whisper API)",
      );
    }

    const fileInfo = await stat(filePath);
    const fileSizeBytes = fileInfo.size;

    const client = new OpenAI({ apiKey });
    const buffer = await readFile(filePath);
    const file = await toFile(buffer, basename(filePath), { type: mimeType });

    const transcription = await client.audio.transcriptions.create({
      file,
      model: config.audio.transcriptionModel,
      response_format: "verbose_json",
    });

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
