/**
 * Zod schemas for structured output from multimodal analysis.
 *
 * These schemas define the validated structure that the pipeline
 * returns after processing any input modality through the LLM.
 */

import { z } from "zod";

export const labelSchema = z.object({
  name: z.string(),
  confidence: z.number().min(0).max(1),
});

export const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  label: z.string(),
});

export const imageAnalysisSchema = z.object({
  description: z.string(),
  labels: z.array(labelSchema),
  objects: z.array(boundingBoxSchema).optional(),
  text: z.string().optional(),
  sentiment: z.string().optional(),
  colors: z.array(z.string()).optional(),
});

export const audioAnalysisSchema = z.object({
  transcription: z.string(),
  summary: z.string(),
  language: z.string().optional(),
  topics: z.array(z.string()).optional(),
  sentiment: z.string().optional(),
  speakers: z.number().optional(),
});

export const videoAnalysisSchema = z.object({
  description: z.string(),
  scenes: z.array(
    z.object({
      timestamp: z.string(),
      description: z.string(),
    }),
  ),
  labels: z.array(labelSchema).optional(),
  summary: z.string(),
});

export const pipelineResultSchema = z.object({
  source: z.string(),
  modality: z.enum(["image", "audio", "video"]),
  mimeType: z.string(),
  analysis: z.union([imageAnalysisSchema, audioAnalysisSchema, videoAnalysisSchema]),
  raw: z.string(),
  model: z.string(),
  usage: z.record(z.number()),
  processedAt: z.string(),
});

export type Label = z.infer<typeof labelSchema>;
export type BoundingBox = z.infer<typeof boundingBoxSchema>;
export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;
export type AudioAnalysis = z.infer<typeof audioAnalysisSchema>;
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;
export type PipelineResult = z.infer<typeof pipelineResultSchema>;
