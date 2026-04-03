// ── Agent Interface ─────────────────────────────────────────────────
//
// All agents implement this interface. The orchestrator invokes
// agents through execute() and uses capabilities for routing
// decisions. Each agent declares what it can do, and the router
// matches subtask requirements to agent capabilities.
//

import type { AgentCapability, SubTask, AgentResult } from "../types.js";

/** Execution context passed to agents during subtask execution. */
export interface AgentExecutionContext {
  /** Read a value from the shared context. */
  get(key: string): unknown;

  /** Write a value to the shared context. */
  set(key: string, value: unknown): void;

  /** Read all values from the shared context. */
  getAll(): Record<string, unknown>;
}

/** Interface that every agent must implement. */
export interface Agent {
  /** Unique agent name (e.g., "planner", "researcher", "coder"). */
  readonly name: string;

  /** Capabilities this agent provides for routing. */
  readonly capabilities: AgentCapability[];

  /** Execute a subtask and return the result. */
  execute(subtask: SubTask, context: AgentExecutionContext): Promise<AgentResult>;
}
