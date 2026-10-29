/**
 * Audio processor.
 *
 * Transcribes audio files through the "transcribe" provider, Amazon
 * Transcribe under the AWS credential chain, staging each file under
 * TRANSCRIBE_S3_URI. The transcribed text is then available for LLM
 * analysis. Registers itself as the "audio" processor on import.
 */

import { stat } from "node:fs/promises";
import { loadConfig } from "../config.js";
import { getTranscriptionProvider } from "../providers/index.js";
import { registerProcessor } from "./registry.js";
import type { ProcessedInput, Processor } from "./types.js";

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

    const fileInfo = await stat(filePath);
    const fileSizeBytes = fileInfo.size;

    const transcription = await getTranscriptionProvider("transcribe").transcribe(
      filePath,
      mimeType,
      {
        s3Uri: config.audio.s3Uri,
        languageCode: config.audio.languageCode,
        timeoutMs: config.audio.transcriptionTimeoutMs,
      },
    );

    return {
      modality: "audio",
      mimeType,
      source: filePath,
      text: transcription.text,
      metadata: {
        duration: transcription.duration,
        language: transcription.language,
        transcriber: "amazon-transcribe",
        fileSizeBytes,
      },
    };
  }
}

registerProcessor(new AudioProcessor());
