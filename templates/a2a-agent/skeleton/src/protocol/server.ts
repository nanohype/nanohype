import type { Task, TaskRequest, TaskResponse, A2AMessage } from "./types.js";
import { getSkill, listSkills } from "../skills/registry.js";
import { logger } from "../logger.js";

/**
 * A2A server — handles incoming task requests.
 *
 * Receives a task request, looks up the matching skill in the registry,
 * executes it, and returns the result as a task response with artifacts.
 */

let taskCounter = 0;

function generateTaskId(): string {
  taskCounter += 1;
  return `task-${Date.now()}-${taskCounter}`;
}

/** Process an incoming A2A task request. */
export async function handleTask(request: TaskRequest): Promise<TaskResponse> {
  const taskId = generateTaskId();
  const now = new Date().toISOString();

  logger.info("Handling incoming task", { taskId, skill: request.skill });

  const inputMessage: A2AMessage = {
    role: "user",
    content: request.input.content,
    timestamp: now,
    metadata: request.input.metadata,
  };

  const task: Task = {
    id: taskId,
    status: "active",
    skill: request.skill,
    input: inputMessage,
    messages: [inputMessage],
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };

  const skill = getSkill(request.skill);

  try {
    const result = await skill.execute(request.input.content, request.input.metadata);

    task.artifacts.push({
      id: `artifact-${taskId}-1`,
      type: "text",
      content: result,
    });

    const agentMessage: A2AMessage = {
      role: "agent",
      content: result,
      timestamp: new Date().toISOString(),
    };
    task.messages.push(agentMessage);
    task.status = "completed";
    task.updatedAt = new Date().toISOString();

    logger.info("Task completed", { taskId, skill: request.skill });
  } catch (error) {
    task.status = "failed";
    task.updatedAt = new Date().toISOString();

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Task failed", { taskId, skill: request.skill, error: errorMessage });

    const failMessage: A2AMessage = {
      role: "agent",
      content: `Error: ${errorMessage}`,
      timestamp: new Date().toISOString(),
    };
    task.messages.push(failMessage);
  }

  return { task };
}

/** List all skills available on this agent. */
export function getAvailableSkills(): string[] {
  return listSkills();
}
