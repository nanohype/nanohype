// ── Orchestrator Core Types ─────────────────────────────────────────
//
// Shared interfaces for tasks, subtasks, agent capabilities,
// orchestrator configuration, and results. These are agent-agnostic
// — any agent implementation works against the same shapes.
//

/** A capability that an agent can provide. */
export interface AgentCapability {
  /** Unique capability name (e.g., "research", "code-generation", "analysis"). */
  name: string;

  /** Human-readable description of what this capability does. */
  description: string;

  /** Keywords for keyword-based routing. */
  keywords?: string[];
}

/** A top-level task submitted to the orchestrator. */
export interface Task {
  /** Unique task identifier. */
  id: string;

  /** Human-readable task description. */
  description: string;

  /** Optional structured input data for the task. */
  input?: Record<string, unknown>;

  /** Optional constraints or preferences for task execution. */
  constraints?: Record<string, unknown>;
}

/** A subtask produced by the planner agent. */
export interface SubTask {
  /** Unique subtask identifier. */
  id: string;

  /** Human-readable subtask description. */
  description: string;

  /** The agent name assigned to execute this subtask. */
  assignedAgent: string;

  /** IDs of subtasks that must complete before this one. */
  dependsOn: string[];

  /** Optional structured input data for the subtask. */
  input?: Record<string, unknown>;

  /** The required capability for this subtask. */
  requiredCapability?: string;
}

/** The result of a single agent executing a subtask. */
export interface AgentResult {
  /** The subtask that was executed. */
  subtaskId: string;

  /** Whether the agent completed successfully. */
  success: boolean;

  /** The output produced by the agent. */
  output: unknown;

  /** Error message if the agent failed. */
  error?: string;

  /** Execution time in milliseconds. */
  durationMs: number;
}

/** The result of the planner agent decomposing a task. */
export interface PlannerResult {
  /** Ordered list of subtasks to execute. */
  subtasks: SubTask[];

  /** The planner's reasoning about how it decomposed the task. */
  reasoning: string;
}

/** Configuration for the orchestrator. */
export interface OrchestratorConfig {
  /** LLM provider name for planner reasoning. Default: from placeholder. */
  providerName?: string;

  /** Maximum subtasks the planner can produce. Default: 10. */
  maxSubtasks?: number;

  /** Maximum total execution time in ms. Default: 300000 (5 min). */
  timeoutMs?: number;
}

/** The final result of orchestrating a task. */
export interface OrchestratorResult {
  /** The original task. */
  task: Task;

  /** The decomposed subtasks from the planner. */
  subtasks: SubTask[];

  /** Results from each agent execution, keyed by subtask ID. */
  results: Map<string, AgentResult>;

  /** Whether all subtasks completed successfully. */
  success: boolean;

  /** Total orchestration time in milliseconds. */
  durationMs: number;

  /** The planner's reasoning about the decomposition. */
  reasoning: string;
}
