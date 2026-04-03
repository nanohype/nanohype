import { metrics } from "@opentelemetry/api";

// ── Pipeline Metrics ────────────────────────────────────────────────
//
// OTel counters and histograms for pipeline observability. These are
// no-ops unless an OTel SDK is initialized by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total documents processed, labeled by outcome status. */
export const pipelineDocumentsProcessed = meter.createCounter(
  "pipeline_documents_processed",
  {
    description: "Total number of documents processed by the pipeline",
  },
);

/** Total chunks created across all documents. */
export const pipelineChunksCreated = meter.createCounter(
  "pipeline_chunks_created",
  {
    description: "Total number of chunks created by the transform stage",
  },
);

/** Full pipeline run duration in milliseconds. */
export const pipelineDuration = meter.createHistogram(
  "pipeline_duration_ms",
  {
    description: "Pipeline run duration in milliseconds",
    unit: "ms",
  },
);
