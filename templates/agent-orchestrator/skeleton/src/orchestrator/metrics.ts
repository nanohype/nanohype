import { metrics } from "@opentelemetry/api";

// ── Orchestrator Metrics ──────────────────────────────────────────
//
// OTel counters and histograms for orchestration observability.
// Tracks task execution counts, subtask counts, agent execution
// latency, and routing decisions. No-ops unless an OTel SDK is
// wired in by the consumer.
//

const meter = metrics.getMeter("__PROJECT_NAME__");

/** Total tasks submitted to the orchestrator. */
export const taskTotal = meter.createCounter("orchestrator_task_total", {
  description: "Total tasks submitted to the orchestrator",
});

/** Total subtasks created by the planner. */
export const subtaskTotal = meter.createCounter("orchestrator_subtask_total", {
  description: "Total subtasks created by the planner",
});

/** Agent execution duration in seconds, labeled by agent name. */
export const agentDuration = meter.createHistogram("orchestrator_agent_duration_seconds", {
  description: "Agent execution latency in seconds",
  unit: "s",
});

/** Total orchestration duration in seconds. */
export const orchestrationDuration = meter.createHistogram("orchestrator_duration_seconds", {
  description: "Total orchestration latency in seconds",
  unit: "s",
});
