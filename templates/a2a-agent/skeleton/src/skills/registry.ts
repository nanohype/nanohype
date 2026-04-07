import type { Skill } from "./types.js";

/**
 * Skill registry. Each skill module registers itself as a side effect
 * of being imported, making the registry the single place to look up
 * a Skill by name at runtime.
 */

const skills = new Map<string, Skill>();

/**
 * Register a skill under the given name.
 * Called at module load time by each skill module.
 */
export function registerSkill(skill: Skill): void {
  skills.set(skill.name, skill);
}

/**
 * Retrieve a skill by name.
 * Throws if the name has not been registered.
 */
export function getSkill(name: string): Skill {
  const skill = skills.get(name);
  if (!skill) {
    const available = [...skills.keys()].join(", ") || "(none)";
    throw new Error(
      `Unknown skill "${name}". Registered skills: ${available}`,
    );
  }
  return skill;
}

/**
 * List the names of all registered skills.
 */
export function listSkills(): string[] {
  return [...skills.keys()];
}

/**
 * Get all registered skill instances.
 */
export function getAllSkills(): Skill[] {
  return [...skills.values()];
}

