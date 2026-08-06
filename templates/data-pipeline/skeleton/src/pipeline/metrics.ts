import { metrics } from "@opentelemetry/api";

// ── Pipeline Metrics ────────────────────────────────────────────────
//
// OTel counters and histograms for pipeline observability. These are
// no-ops unless an OTel SDK is initialized by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total documents the pipeline took in, labeled by outcome status — the
 *  "requests" of RED, and the denominator pipelineErrorsTotal divides into.
 *
 *  Named _requests_total rather than _documents_processed because SLOPolicy's
 *  availability SLI builds `<metric>_errors_total / <metric>_requests_total`
 *  from `sli.metric` alone. A denominator under any other name means the ratio
 *  evaluates empty and the objective reports NoData forever — the errors
 *  counter below already called itself the "errors" of RED, and this is the
 *  half that was missing. */
export const pipelineRequestsTotal = meter.createCounter("pipeline_requests_total", {
  description: "Total documents taken in by the pipeline, labeled by outcome status",
});

/** Total chunks created across all documents. */
export const pipelineChunksCreated = meter.createCounter("pipeline_chunks_created", {
  description: "Total number of chunks created by the transform stage",
});

/** Full pipeline run duration in seconds. */
export const pipelineDuration = meter.createHistogram("pipeline_duration_seconds", {
  description: "Pipeline run duration in seconds",
  unit: "s",
});

/** Terminal stage errors, labeled by stage (ingest/transform/embed/output) — the
 *  "errors" of RED. Incremented when a stage fails after retries are exhausted. */
export const pipelineErrorsTotal = meter.createCounter("pipeline_errors_total", {
  description: "Total terminal stage errors, labeled by stage",
});
