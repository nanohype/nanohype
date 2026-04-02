/**
 * Image processor.
 *
 * Reads image files, resizes if necessary to stay within the LLM's
 * dimension limits, and encodes as base64 for vision API consumption.
 * Registers itself as the "image" processor on import.
 */

import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { Processor, ProcessedInput } from "./types.js";
import { registerProcessor } from "./registry.js";
import { loadConfig } from "../config.js";

const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

class ImageProcessor implements Processor {
  readonly modality = "image" as const;
  readonly supportedMimeTypes = SUPPORTED_MIME_TYPES;

  async process(filePath: string, mimeType: string): Promise<ProcessedInput> {
    const config = loadConfig();
    const maxDim = config.image.maxDimension;

    const raw = await readFile(filePath);
    let buffer = raw;
    let width: number | undefined;
    let height: number | undefined;

    // Resize if the image exceeds max dimensions (skip SVGs)
    if (mimeType !== "image/svg+xml") {
      const image = sharp(raw);
      const metadata = await image.metadata();
      width = metadata.width;
      height = metadata.height;

      if ((width && width > maxDim) || (height && height > maxDim)) {
        buffer = await image
          .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
          .toBuffer();
        const resized = await sharp(buffer).metadata();
        width = resized.width;
        height = resized.height;
      }
    }

    const base64 = buffer.toString("base64");

    return {
      modality: "image",
      mimeType,
      source: filePath,
      base64,
      metadata: {
        width,
        height,
        originalSize: raw.length,
        processedSize: buffer.length,
        detail: config.image.detail,
      },
    };
  }
}

registerProcessor(new ImageProcessor());
