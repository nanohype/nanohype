export { getAllSkills, getSkill, listSkills, registerSkill } from "./registry.js";
export type { Skill } from "./types.js";

// Side-effect imports: trigger skill self-registration
import "./example.js";
