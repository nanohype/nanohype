// ── Agent Barrel ────────────────────────────────────────────────────
//
// Importing this module causes all built-in agents to self-register
// with the agent registry. Custom agents can be added by importing
// their module after this one.
//

import "./planner.js";
import "./researcher.js";
import "./mock.js";

export { registerAgent, getAgent, listAgents, getAllAgents } from "./registry.js";
export type { Agent, AgentExecutionContext } from "./types.js";
