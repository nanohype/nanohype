/**
 * Video processor.
 *
 * Extracts frames from video files at configurable intervals using
 * sharp for image processing. Each frame is base64-encoded for
 * sequential vision LLM analysis. Registers itself as the "video"
 * processor on import.
 *
 * Note: This processor requires ffmpeg to be available on the system
 * PATH for frame extraction. It spawns ffmpeg as a child process to
 * extract frames, then processes each frame through sharp.
 */

import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { Processor, ProcessedInput } from "./types.js";
import { registerProcessor } from "./registry.js";
import { loadConfig } from "../config.js";

const execFileAsync = promisify(execFile);

const SUPPORTED_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];

class VideoProcessor implements Processor {
  readonly modality = "video" as const;
  readonly supportedMimeTypes = SUPPORTED_MIME_TYPES;

  async process(filePath: string, mimeType: string): Promise<ProcessedInput> {
    const config = loadConfig();
    const interval = config.video.frameIntervalSeconds;
    const maxFrames = config.video.maxFrames;
    const maxDim = config.image.maxDimension;

    // Extract frames to a temp directory using ffmpeg
    const tmpDir = await mkdtemp(join(tmpdir(), "multimodal-video-"));

    try {
      await execFileAsync("ffmpeg", [
        "-i", filePath,
        "-vf", `fps=1/${interval},scale=${maxDim}:${maxDim}:force_original_aspect_ratio=decrease`,
        "-frames:v", String(maxFrames),
        "-q:v", "2",
        join(tmpDir, "frame-%04d.jpg"),
      ]);

      // Read extracted frames
      const frameFiles = (await readdir(tmpDir))
        .filter((f) => f.startsWith("frame-"))
        .sort();

      const frames: string[] = [];

      for (const frameFile of frameFiles.slice(0, maxFrames)) {
        const framePath = join(tmpDir, frameFile);
        const buffer = await readFile(framePath);
        const resized = await sharp(buffer)
          .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        frames.push(resized.toString("base64"));
      }

      return {
        modality: "video",
        mimeType,
        source: filePath,
        frames,
        metadata: {
          frameCount: frames.length,
          intervalSeconds: interval,
          maxDimension: maxDim,
        },
      };
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
}

registerProcessor(new VideoProcessor());
