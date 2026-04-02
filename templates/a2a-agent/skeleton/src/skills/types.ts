/**
 * Skill interface for A2A agent capabilities.
 *
 * A skill is a discrete action the agent can perform. Skills are
 * registered in the skill registry and advertised to remote agents
 * via the Agent Card. Each skill declares what it can do and handles
 * execution when a task targets it.
 */
export interface Skill {
  /** Unique skill name, used for lookup and Agent Card advertisement. */
  name: string;

  /** Human-readable description of what this skill does. */
  description: string;

  /** MIME types this skill accepts as input. */
  inputTypes: string[];

  /** MIME types this skill produces as output. */
  outputTypes: string[];

  /**
   * Execute the skill with the given input content.
   * Returns the result as a string.
   */
  execute(input: string, metadata?: Record<string, unknown>): Promise<string>;
}
