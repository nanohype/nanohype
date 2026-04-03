import { metrics } from "@opentelemetry/api";

// ── Worker Metrics ────────────────────────────────────────────────
//
// OTel counters and histograms for worker observability. These are
// no-ops unless an OTel SDK is initialized by the consumer. The meter
// name matches the project so dashboards can filter by service.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total queue jobs processed, labeled by job name and outcome status. */
export const workerJobTotal = meter.createCounter("worker_job_total", {
  description: "Total number of queue jobs processed",
});

/** Queue job processing duration in milliseconds, labeled by job name. */
export const workerJobDuration = meter.createHistogram(
  "worker_job_duration_ms",
  {
    description: "Queue job processing latency in milliseconds",
    unit: "ms",
  }
);

/** Total cron job executions, labeled by job name and outcome status. */
export const workerCronTotal = meter.createCounter("worker_cron_total", {
  description: "Total number of cron job executions",
});
