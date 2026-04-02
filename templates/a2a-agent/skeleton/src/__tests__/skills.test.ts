import { describe, it, expect, beforeEach } from "vitest";

/**
 * Skill registry tests.
 *
 * Tests the skill registry, skill lookup, and the example skill
 * implementation to verify correct registration and execution.
 */

// Import registry functions — side-effect imports register built-in skills
import { getSkill, listSkills, getAllSkills, registerSkill } from "../skills/registry.js";
import type { Skill } from "../skills/types.js";

describe("Skill Registry", () => {
  it("lists registered skills", () => {
    const skills = listSkills();
    expect(skills).toContain("echo");
  });

  it("retrieves a skill by name", () => {
    const skill = getSkill("echo");
    expect(skill).toBeDefined();
    expect(skill.name).toBe("echo");
    expect(skill.description).toBeTruthy();
  });

  it("throws for unknown skill", () => {
    expect(() => getSkill("nonexistent-skill")).toThrow(/Unknown skill/);
  });

  it("returns all skill instances", () => {
    const skills = getAllSkills();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0]?.name).toBeDefined();
  });

  it("registers a custom skill", () => {
    const custom: Skill = {
      name: "test-custom",
      description: "A test skill",
      inputTypes: ["text/plain"],
      outputTypes: ["text/plain"],
      execute: async (input: string) => `custom: ${input}`,
    };
    registerSkill(custom);
    expect(listSkills()).toContain("test-custom");
    expect(getSkill("test-custom").name).toBe("test-custom");
  });
});

describe("Echo Skill", () => {
  it("executes and returns a greeting", async () => {
    const skill = getSkill("echo");
    const result = await skill.execute("test input");
    expect(result).toContain("test input");
  });

  it("declares text/plain input and output types", () => {
    const skill = getSkill("echo");
    expect(skill.inputTypes).toContain("text/plain");
    expect(skill.outputTypes).toContain("text/plain");
  });
});
