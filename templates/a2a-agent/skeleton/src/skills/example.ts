import type { Skill } from "./types.js";
import { registerSkill } from "./registry.js";
import { logger } from "../logger.js";

/**
 * Example skill implementation.
 *
 * This is a minimal skill that echoes the input back with a greeting.
 * Use this as a starting point for building real skills — replace the
 * execute logic with your own implementation.
 */
const echoSkill: Skill = {
  name: "echo",
  description: "Echoes the input back with a greeting",
  inputTypes: ["text/plain"],
  outputTypes: ["text/plain"],

  async execute(input: string, metadata?: Record<string, unknown>): Promise<string> {
    logger.info("Executing echo skill", { inputLength: input.length, metadata });
    return `Hello from __PROJECT_NAME__! You said: ${input}`;
  },
};

registerSkill(echoSkill);
