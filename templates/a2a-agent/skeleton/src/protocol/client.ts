import type { AgentCard, TaskRequest, TaskResponse } from "./types.js";
import { getTransport } from "./transport/index.js";
import { logger } from "../logger.js";

/**
 * A2A client — discovers remote agents and sends task requests.
 *
 * Uses the transport registry to send requests via the configured
 * transport (HTTP, WebSocket, or custom).
 */

/** Fetch a remote agent's Agent Card from its well-known URL. */
export async function fetchAgentCard(agentUrl: string): Promise<AgentCard> {
  const cardUrl = `${agentUrl.replace(/\/$/, "")}/.well-known/agent.json`;
  logger.info("Fetching agent card", { url: cardUrl });

  const response = await fetch(cardUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch agent card from ${cardUrl}: ${response.status}`);
  }

  return (await response.json()) as AgentCard;
}

/** Send a task request to a remote agent. */
export async function sendTask(
  agentUrl: string,
  request: TaskRequest,
  transportName?: string,
): Promise<TaskResponse> {
  const transport = getTransport(transportName ?? "__TRANSPORT__");

  logger.info("Sending task to remote agent", {
    url: agentUrl,
    skill: request.skill,
    transport: transportName ?? "__TRANSPORT__",
  });

  return transport.sendTask(agentUrl, request);
}

/** Check if a remote agent supports a given skill. */
export async function supportsSkill(agentUrl: string, skillName: string): Promise<boolean> {
  const card = await fetchAgentCard(agentUrl);
  return card.skills.some((s) => s.name === skillName);
}
