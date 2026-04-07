import OpenAI from "openai";
import { createReadStream } from "node:fs";
import type {
  TrainingProvider,
  TrainingJobConfig,
  TrainingJobStatus,
} from "./types.js";
import { registerProvider } from "./registry.js";
import { createCircuitBreaker } from "../resilience/circuit-breaker.js";

/**
 * Map OpenAI fine-tuning job status strings to our normalized status.
 */
function normalizeStatus(
  status: string,
): TrainingJobStatus["status"] {
  switch (status) {
    case "validating_files":
    case "queued":
      return "pending";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

/**
 * OpenAI fine-tuning provider. Uses the OpenAI fine-tuning API to upload
 * training files, create fine-tuning jobs, and poll for status. Requires
 * the OPENAI_API_KEY environment variable.
 */
export class OpenAITrainingProvider implements TrainingProvider {
  private client: OpenAI;
  private cb = createCircuitBreaker();

  constructor() {
    this.client = new OpenAI();
  }

  async uploadFile(filePath: string): Promise<string> {
    const file = await this.cb.execute(() =>
      this.client.files.create({
        file: createReadStream(filePath),
        purpose: "fine-tune",
      }),
    );
    return file.id;
  }

  async createJob(config: TrainingJobConfig): Promise<TrainingJobStatus> {
    // Upload training file
    const trainingFileId = await this.uploadFile(config.trainingFile);

    // Upload validation file if provided
    let validationFileId: string | undefined;
    if (config.validationFile) {
      validationFileId = await this.uploadFile(config.validationFile);
    }

    // Build hyperparameters — only include non-undefined values
    const hyperparameters: Record<string, unknown> = {};
    if (config.epochs !== undefined) {
      hyperparameters.n_epochs = config.epochs;
    }
    if (config.learningRateMultiplier !== undefined) {
      hyperparameters.learning_rate_multiplier = config.learningRateMultiplier;
    }
    if (config.batchSize !== undefined) {
      hyperparameters.batch_size = config.batchSize;
    }

    const job = await this.cb.execute(() =>
      this.client.fineTuning.jobs.create({
        training_file: trainingFileId,
        validation_file: validationFileId,
        model: config.baseModel,
        suffix: config.suffix,
        hyperparameters:
          Object.keys(hyperparameters).length > 0 ? hyperparameters : undefined,
      }),
    );

    return this.mapJob(job);
  }

  async getJobStatus(jobId: string): Promise<TrainingJobStatus> {
    const job = await this.cb.execute(() =>
      this.client.fineTuning.jobs.retrieve(jobId),
    );
    return this.mapJob(job);
  }

  async cancelJob(jobId: string): Promise<TrainingJobStatus> {
    const job = await this.cb.execute(() =>
      this.client.fineTuning.jobs.cancel(jobId),
    );
    return this.mapJob(job);
  }

  async listJobs(limit = 10): Promise<TrainingJobStatus[]> {
    const jobs = await this.cb.execute(() =>
      this.client.fineTuning.jobs.list({ limit }),
    );
    const results: TrainingJobStatus[] = [];
    for await (const job of jobs) {
      results.push(this.mapJob(job));
      if (results.length >= limit) break;
    }
    return results;
  }

  async complete(model: string, prompt: string): Promise<string> {
    const response = await this.cb.execute(() =>
      this.client.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    );
    return response.choices[0]?.message?.content ?? "";
  }

  /**
   * Map an OpenAI fine-tuning job object to our normalized status type.
   */
  private mapJob(
    job: OpenAI.FineTuning.Jobs.FineTuningJob,
  ): TrainingJobStatus {
    return {
      id: job.id,
      status: normalizeStatus(job.status),
      baseModel: job.model,
      fineTunedModel: job.fine_tuned_model ?? undefined,
      trainedEpochs: job.trained_tokens
        ? undefined
        : undefined,
      error: job.error?.message ?? undefined,
      createdAt: new Date(job.created_at * 1000).toISOString(),
      finishedAt: job.finished_at
        ? new Date(job.finished_at * 1000).toISOString()
        : undefined,
    };
  }
}

registerProvider("openai", () => new OpenAITrainingProvider());
