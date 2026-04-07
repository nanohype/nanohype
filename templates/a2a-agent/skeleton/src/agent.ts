import { validateBootstrap } from "./bootstrap.js";
import { getProvider } from "./providers/index.js";
import { handleTask, getAvailableSkills } from "./protocol/server.js";
import { sendTask, fetchAgentCard } from "./protocol/client.js";
import { listSkills, getSkill } from "./skills/index.js";
import type { TaskRequest } from "./protocol/types.js";
import type { Message } from "./providers/types.js";
import { logger } from "./logger.js";

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

const PROVIDER_NAME = "__LLM_PROVIDER__";

const SYSTEM_PROMPT = `You are an A2A protocol agent named "__PROJECT_NAME__".
Your role is to analyze incoming requests and decide which skill to use.

Available skills:
{{SKILLS}}

Given a user request, respond with a JSON object:
{
  "skill": "<skill-name>",
  "reasoning": "<why this skill was chosen>"
}

If no skill matches, respond with:
{
  "skill": null,
  "reasoning": "<explanation>"
}`;

/** Use the LLM to select the best skill for a given input. */
async function selectSkill(input: string): Promise<string | null> {
  const provider = getProvider(PROVIDER_NAME);

  const skills = listSkills();
  const skillDescriptions = skills
    .map((name) => {
      const skill = getSkill(name);
      return `- ${skill.name}: ${skill.description}`;
    })
    .join("\n");

  const prompt = SYSTEM_PROMPT.replace("{{SKILLS}}", skillDescriptions);

  const messages: Message[] = [{ role: "user", content: input }];
  const response = await provider.sendMessage(prompt, messages);

  try {
    const parsed = JSON.parse(response.content) as { skill: string | null; reasoning: string };
    logger.info("Skill selected", { skill: parsed.skill, reasoning: parsed.reasoning });
    return parsed.skill;
  } catch {
    logger.warn("Failed to parse LLM skill selection, falling back to first skill", {
      response: response.content,
    });
    return skills[0] ?? null;
  }
}

/** Process an incoming request using LLM-guided skill selection. */
export async function processRequest(input: string): Promise<string> {
  logger.info("Processing request", { inputLength: input.length });

  const skillName = await selectSkill(input);
  if (!skillName) {
    return "No matching skill found for this request.";
  }

  const request: TaskRequest = {
    skill: skillName,
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
