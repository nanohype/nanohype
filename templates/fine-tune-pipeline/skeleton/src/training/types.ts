/**
 * Shared types for training provider implementations.
 */

/**
 * Configuration for submitting a fine-tuning job.
 */
export interface TrainingJobConfig {
  /** Path to the training JSONL file */
  trainingFile: string;
  /** Path to the validation JSONL file (optional) */
  validationFile?: string;
  /** Base model identifier to fine-tune */
  baseModel: string;
  /** Number of training epochs */
  epochs?: number;
  /** Learning rate multiplier */
  learningRateMultiplier?: number;
  /** Training batch size */
  batchSize?: number;
  /** Suffix appended to the fine-tuned model name */
  suffix?: string;
}

/**
 * Status of a fine-tuning job.
 */
export interface TrainingJobStatus {
  /** Provider-specific job identifier */
  id: string;
  /** Current job state */
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  /** Base model being fine-tuned */
  baseModel: string;
  /** Fine-tuned model identifier (available when status is "succeeded") */
  fineTunedModel?: string;
  /** Number of completed training epochs */
  trainedEpochs?: number;
  /** Training metrics (loss, accuracy, etc.) */
  metrics?: Record<string, number>;
  /** Error message if status is "failed" */
  error?: string;
  /** ISO timestamp when the job was created */
  createdAt: string;
  /** ISO timestamp when the job completed */
  finishedAt?: string;
}

/**
 * Common interface that every training provider must implement.
 * Handles file upload, job submission, status polling, and cancellation.
 */
export interface TrainingProvider {
  /** Upload a JSONL file and return a provider-specific file identifier */
  uploadFile(filePath: string): Promise<string>;

  /** Submit a fine-tuning job and return the job status */
  createJob(config: TrainingJobConfig): Promise<TrainingJobStatus>;

  /** Poll the current status of a fine-tuning job */
  getJobStatus(jobId: string): Promise<TrainingJobStatus>;

  /** Cancel a running fine-tuning job */
  cancelJob(jobId: string): Promise<TrainingJobStatus>;

  /** List recent fine-tuning jobs */
  listJobs(limit?: number): Promise<TrainingJobStatus[]>;

  /** Generate a completion from a model (used for eval) */
  complete(model: string, prompt: string): Promise<string>;
}
