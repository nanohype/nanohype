import type {
  TrainingProvider,
  TrainingJobConfig,
  TrainingJobStatus,
} from "./types.js";
import { registerProvider } from "./registry.js";

// ── Mock Training Provider ────────────────────────────────────────
//
// Simulates the fine-tuning job lifecycle without calling any external
// API. Upload returns a fake file ID, createJob returns a fake job ID,
// and getJobStatus cycles through queued -> running -> succeeded after
// N calls per job. Useful for local development and testing.
//

let fileCounter = 0;
let jobCounter = 0;

/** Track how many times getJobStatus has been called per job */
const statusCallCounts = new Map<string, number>();

/** In-memory job store */
const jobs = new Map<string, TrainingJobStatus>();

/**
 * Determine job status based on how many times it has been polled.
 * - Calls 0-1: pending (queued)
 * - Calls 2-3: running
 * - Calls 4+:  succeeded
 */
function resolveStatus(jobId: string): TrainingJobStatus["status"] {
  const calls = statusCallCounts.get(jobId) ?? 0;
  if (calls <= 1) return "pending";
  if (calls <= 3) return "running";
  return "succeeded";
}

class MockTrainingProvider implements TrainingProvider {
  async uploadFile(_filePath: string): Promise<string> {
    fileCounter++;
    return `mock-file-${fileCounter.toString().padStart(4, "0")}`;
  }

  async createJob(config: TrainingJobConfig): Promise<TrainingJobStatus> {
    jobCounter++;
    const jobId = `mock-ftjob-${jobCounter.toString().padStart(4, "0")}`;
    const now = new Date().toISOString();

    const status: TrainingJobStatus = {
      id: jobId,
      status: "pending",
      baseModel: config.baseModel,
      createdAt: now,
    };

    jobs.set(jobId, status);
    statusCallCounts.set(jobId, 0);
    return { ...status };
  }

  async getJobStatus(jobId: string): Promise<TrainingJobStatus> {
    const job = jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job: ${jobId}`);
    }

    // Increment call count and resolve status
    const calls = (statusCallCounts.get(jobId) ?? 0) + 1;
    statusCallCounts.set(jobId, calls);
    const currentStatus = resolveStatus(jobId);

    const updated: TrainingJobStatus = {
      ...job,
      status: currentStatus,
    };

    // Add metrics and completion details once succeeded
    if (currentStatus === "succeeded") {
      updated.fineTunedModel = `mock:${job.baseModel}:ft-${jobId}`;
      updated.trainedEpochs = 3;
      updated.finishedAt = new Date().toISOString();
      updated.metrics = {
        training_loss: 0.0342,
        validation_loss: 0.0415,
        training_accuracy: 0.971,
      };
    } else if (currentStatus === "running") {
      updated.metrics = {
        training_loss: Math.max(0.01, 0.2150 - calls * 0.04),
        step: calls * 50,
      };
    }

    jobs.set(jobId, updated);
    return { ...updated };
  }

  async cancelJob(jobId: string): Promise<TrainingJobStatus> {
    const job = jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job: ${jobId}`);
    }

    const cancelled: TrainingJobStatus = {
      ...job,
      status: "cancelled",
      finishedAt: new Date().toISOString(),
    };
    jobs.set(jobId, cancelled);
    return { ...cancelled };
  }

  async listJobs(limit = 10): Promise<TrainingJobStatus[]> {
    const all = Array.from(jobs.values());
    return all.slice(-limit).reverse();
  }

  async complete(_model: string, prompt: string): Promise<string> {
    // Deterministic completion for eval: echo a structured response
    return `[mock completion] Input length: ${prompt.length} chars. The model has been fine-tuned and produces consistent, structured output for evaluation purposes.`;
  }
}

registerProvider("mock", () => new MockTrainingProvider());
