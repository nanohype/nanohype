import { metrics } from "@opentelemetry/api";

// ── Queue Metrics ──────────────────────────────────────────────────
//
// OTel counters and histograms for queue worker observability. These
// are no-ops unless an OTel SDK is initialized by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total jobs processed, labeled by job name and outcome status. */
export const queueJobTotal = meter.createCounter("queue_job_total", {
  description: "Total number of queue jobs processed",
});

/** Job processing duration in milliseconds, labeled by job name. */
export const queueJobDuration = meter.createHistogram(
  "queue_job_duration_ms",
  {
    description: "Queue job processing latency in milliseconds",
    unit: "ms",
  },
);
