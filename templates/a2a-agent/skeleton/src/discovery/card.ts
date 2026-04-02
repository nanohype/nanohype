import type { AgentCard, SkillDescriptor } from "../protocol/types.js";
import { getAllSkills } from "../skills/registry.js";
import { logger } from "../logger.js";

/**
 * Agent Card generator.
 *
 * Builds the Agent Card for this agent from the skill registry.
 * The card is served at /.well-known/agent.json and declares
 * the agent's identity, capabilities, and protocol version.
 */

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:3000";

/** Build the Agent Card from the current skill registry. */
export function buildAgentCard(): AgentCard {
  const skills: SkillDescriptor[] = getAllSkills().map((skill) => ({
    name: skill.name,
    description: skill.description,
    inputTypes: skill.inputTypes,
    outputTypes: skill.outputTypes,
  }));

  const card: AgentCard = {
    name: "__PROJECT_NAME__",
    description: "__DESCRIPTION__",
    url: AGENT_URL,
    skills,
    version: "0.1.0",
    protocol: "a2a/v1",
  };

  logger.debug("Built agent card", { name: card.name, skillCount: skills.length });
  return card;
}

/** Serialize the Agent Card as a JSON string. */
export function agentCardJson(): string {
  return JSON.stringify(buildAgentCard(), null, 2);
}
