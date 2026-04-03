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

/** Agent execution duration in milliseconds, labeled by agent name. */
export const agentDuration = meter.createHistogram(
  "orchestrator_agent_duration_ms",
  {
    description: "Agent execution latency in milliseconds",
    unit: "ms",
  },
);

/** Total orchestration duration in milliseconds. */
export const orchestrationDuration = meter.createHistogram(
  "orchestrator_duration_ms",
  {
    description: "Total orchestration latency in milliseconds",
    unit: "ms",
  },
);
