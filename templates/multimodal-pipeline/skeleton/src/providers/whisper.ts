/**
 * OpenAI Whisper transcription provider.
 *
 * Wraps the OpenAI Whisper API behind a dedicated interface for audio
 * transcription. The audio processor uses this instead of importing
 * the OpenAI SDK directly, keeping all provider logic in one place.
 * Registers itself as the "whisper" transcription provider on import.
 */

import OpenAI, { toFile } from "openai";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

/**
 * Result returned by the transcription provider.
 */
export interface TranscriptionResult {
  text: string;
  duration?: number;
  language?: string;
}

/**
 * Interface for audio transcription providers.
 */
export interface TranscriptionProvider {
  transcribe(
    filePath: string,
    mimeType: string,
    model: string,
  ): Promise<TranscriptionResult>;
}

const transcriptionProviders = new Map<string, (apiKey?: string) => TranscriptionProvider>();

export function registerTranscriptionProvider(
  name: string,
  factory: (apiKey?: string) => TranscriptionProvider,
): void {
  transcriptionProviders.set(name, factory);
}

export function getTranscriptionProvider(
  name: string,
  apiKey?: string,
): TranscriptionProvider {
  const factory = transcriptionProviders.get(name);
  if (!factory) {
    const available = [...transcriptionProviders.keys()].join(", ") || "(none)";
    throw new Error(
      `Unknown transcription provider "${name}". Registered: ${available}`,
    );
  }
  return factory(apiKey);
}

// ── Whisper implementation ──────────────────────────────────────────

class WhisperTranscriptionProvider implements TranscriptionProvider {
  private readonly client: OpenAI;
  private readonly cb = createCircuitBreaker();

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for audio transcription (Whisper API)",
      );
    }
    this.client = new OpenAI({ apiKey: key });
  }

  async transcribe(
    filePath: string,
    mimeType: string,
    model: string,
  ): Promise<TranscriptionResult> {
    const buffer = await readFile(filePath);
    const file = await toFile(buffer, basename(filePath), { type: mimeType });

    const transcription = await this.cb.execute(() =>
      this.client.audio.transcriptions.create({
        file,
        model,
        response_format: "verbose_json",
      }),
    );

    return {
      text: transcription.text,
      duration: transcription.duration,
      language: transcription.language,
    };
  }
}

registerTranscriptionProvider(
  "whisper",
  (apiKey?: string) => new WhisperTranscriptionProvider(apiKey),
);
