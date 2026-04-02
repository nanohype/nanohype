/**
 * A2A protocol message types.
 *
 * The A2A protocol defines four core concepts:
 * - Agent Card: declares an agent's identity, skills, and supported types
 * - Task: a unit of work sent from one agent to another
 * - Artifact: the result of a completed task
 * - Message: communication within a task (user/agent messages)
 */

/** Status of a task in the A2A lifecycle. */
export type TaskStatus = "pending" | "active" | "completed" | "failed" | "cancelled";

/** A message exchanged within a task. */
export interface A2AMessage {
  role: "user" | "agent";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** An artifact produced by a completed task. */
export interface Artifact {
  id: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/** A task represents a unit of work sent between agents. */
export interface Task {
  id: string;
  status: TaskStatus;
  skill: string;
  input: A2AMessage;
  messages: A2AMessage[];
  artifacts: Artifact[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** A request to create a new task. */
export interface TaskRequest {
  skill: string;
  input: {
    content: string;
    metadata?: Record<string, unknown>;
  };
}

/** A response containing a task and its current state. */
export interface TaskResponse {
  task: Task;
}

/** Skill descriptor published in the Agent Card. */
export interface SkillDescriptor {
  name: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
}

/** Agent Card — published at /.well-known/agent.json. */
export interface AgentCard {
  name: string;
  description: string;
  url: string;
  skills: SkillDescriptor[];
  version: string;
  protocol: "a2a/v1";
}

/** Error response from an A2A endpoint. */
export interface A2AError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
