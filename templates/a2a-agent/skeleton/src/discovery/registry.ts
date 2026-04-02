import type { AgentCard } from "../protocol/types.js";
import { fetchAgentCard } from "../protocol/client.js";
import { logger } from "../logger.js";

/**
 * Agent directory — discovers and caches remote agent cards.
 *
 * Maintains a registry of known agents and their capabilities.
 * Agents can be added by URL; their Agent Card is fetched and cached
 * for capability lookup without repeated network calls.
 */

const agents = new Map<string, AgentCard>();

/**
 * Register a remote agent by fetching its Agent Card.
 * The card is cached for subsequent lookups.
 */
export async function discoverAgent(agentUrl: string): Promise<AgentCard> {
  const existing = agents.get(agentUrl);
  if (existing) {
    logger.debug("Agent already discovered", { url: agentUrl, name: existing.name });
    return existing;
  }

  logger.info("Discovering agent", { url: agentUrl });
  const card = await fetchAgentCard(agentUrl);
  agents.set(agentUrl, card);
  logger.info("Agent discovered", { url: agentUrl, name: card.name, skills: card.skills.length });
  return card;
}

/**
 * Find agents that support a given skill name.
 * Searches all discovered agents' cards.
 */
export function findAgentsWithSkill(skillName: string): Array<{ url: string; card: AgentCard }> {
  const results: Array<{ url: string; card: AgentCard }> = [];
  for (const [url, card] of agents) {
    if (card.skills.some((s) => s.name === skillName)) {
      results.push({ url, card });
    }
  }
  return results;
}

/** Get all discovered agents. */
export function listAgents(): Array<{ url: string; card: AgentCard }> {
  return [...agents.entries()].map(([url, card]) => ({ url, card }));
}

/** Remove a previously discovered agent from the directory. */
export function removeAgent(agentUrl: string): boolean {
  return agents.delete(agentUrl);
}

/** Clear all discovered agents from the directory. */
export function clearAgents(): void {
  agents.clear();
}
