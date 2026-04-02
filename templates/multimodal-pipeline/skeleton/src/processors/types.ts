/**
 * Shared interfaces for multimodal processors.
 *
 * Each processor handles a specific modality (image, audio, video) and
 * converts raw file content into a format suitable for LLM analysis.
 */

export type Modality = "image" | "audio" | "video";

export interface ProcessedInput {
  /** The detected modality of the input. */
  modality: Modality;
  /** MIME type of the original file. */
  mimeType: string;
  /** Original file path or identifier. */
  source: string;
  /** Base64-encoded content for vision APIs. */
  base64?: string;
  /** Transcribed or extracted text content. */
  text?: string;
  /** Extracted frames as base64 strings (video processing). */
  frames?: string[];
  /** Additional metadata from processing. */
  metadata: Record<string, unknown>;
}

export interface Processor {
  /** The modality this processor handles. */
  readonly modality: Modality;
  /** MIME types this processor can handle. */
  readonly supportedMimeTypes: string[];
  /** Process a file and return structured input for LLM analysis. */
  process(filePath: string, mimeType: string): Promise<ProcessedInput>;
}
