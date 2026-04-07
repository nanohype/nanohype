export { registerSkill, getSkill, listSkills, getAllSkills } from "./registry.js";
export type { Skill } from "./types.js";

// Side-effect imports: trigger skill self-registration
import "./example.js";
