import { validateBootstrap } from "./bootstrap.js";
import { logger } from "./logger.js";
import { fetchAgentCard, sendTask } from "./protocol/client.js";
import { getAvailableSkills, handleTask } from "./protocol/server.js";
import type { TaskRequest } from "./protocol/types.js";
import { PROVIDER_NAME, routeTask } from "./routing.js";

// Ensure transports are registered
import "./protocol/transport/index.js";

/**
 * A2A Agent — exposes skills to other agents and invokes remote agents.
 *
 * This agent can:
 * 1. Receive incoming task requests and dispatch them to registered skills
 * 2. Use an LLM provider for reasoning about which skill to use
 * 3. Call remote agents via the A2A client
 *
 * The agent uses the __LLM_PROVIDER__ provider for reasoning and the
 * __TRANSPORT__ transport for A2A communication.
 */

/** Process an incoming request using LLM-guided skill selection. */
export async function processRequest(input: string): Promise<string> {
  logger.info("Processing request", { inputLength: input.length });

  const decision = await routeTask(input);
  if (!decision.skill) {
    return `No matching skill found for this request. ${decision.reasoning}`;
  }

  const request: TaskRequest = {
    skill: decision.skill,
    input: { content: input },
  };

  const response = await handleTask(request);
  return response.task.artifacts[0]?.content ?? "Task completed with no output.";
}

/** Invoke a skill on a remote agent. */
export async function invokeRemoteAgent(
  agentUrl: string,
  skillName: string,
  input: string,
): Promise<string> {
  logger.info("Invoking remote agent", { url: agentUrl, skill: skillName });

  const request: TaskRequest = {
    skill: skillName,
    input: { content: input },
  };

  const response = await sendTask(agentUrl, request);
  return response.task.artifacts[0]?.content ?? "Remote task completed with no output.";
}

// ─── Entry point ───

async function main(): Promise<void> {
  validateBootstrap();

  logger.info("Starting A2A agent", {
    name: "__PROJECT_NAME__",
    provider: PROVIDER_NAME,
    skills: getAvailableSkills(),
  });

  // Demo: process a sample request
  const result = await processRequest("Hello, what can you do?");
  logger.info("Agent response", { result });
}

main().catch((error) => {
  logger.error("Agent failed", { error: String(error) });
  process.exit(1);
});
