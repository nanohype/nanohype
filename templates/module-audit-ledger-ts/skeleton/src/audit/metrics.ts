import { metrics } from "@opentelemetry/api";

// ── Audit Ledger Metrics ────────────────────────────────────────────
//
// OTel counters for audit observability. No-ops unless an OTel SDK is
// wired in by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Events appended, labeled by provider and result (ok | error). */
export const auditAppendTotal = meter.createCounter("audit_append_total", {
  description: "Audit events appended, by provider and result",
});

/** Context queries, labeled by provider. */
export const auditQueryTotal = meter.createCounter("audit_query_total", {
  description: "Audit context queries, by provider",
});
