/**
 * Type definitions for fine-tuning dataset preparation.
 */

import { z } from "zod";

/**
 * A single message in a training conversation.
 */
export const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

export type Message = z.infer<typeof messageSchema>;

/**
 * A single training example — a complete conversation with at least
 * one user message and one assistant response.
 */
export const trainingExampleSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(2)
    .refine(
      (msgs) => msgs.some((m) => m.role === "user") && msgs.some((m) => m.role === "assistant"),
      { message: "Training example must contain at least one user and one assistant message" },
    ),
});

export type TrainingExample = z.infer<typeof trainingExampleSchema>;

/**
 * Result of splitting a dataset into train/validation/test sets.
 */
export interface DatasetSplit {
  train: TrainingExample[];
  validation: TrainingExample[];
  test: TrainingExample[];
}

/**
 * Statistics from the dataset preparation process.
 */
export interface PrepareStats {
  totalExamples: number;
  validExamples: number;
  invalidExamples: number;
  trainCount: number;
  valCount: number;
  testCount: number;
  outputDir: string;
}

/**
 * Validation result for a single training example.
 */
export interface ValidationResult {
  valid: boolean;
  index: number;
  errors: string[];
}
