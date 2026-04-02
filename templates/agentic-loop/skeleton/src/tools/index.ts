import { ToolRegistry } from "./registry.js";
import { calculatorTool } from "./example.js";

/**
 * The shared tool registry. Import this wherever you need to access
 * registered tools (the agent loop, eval runner, etc.).
 *
 * To add a new tool:
 * 1. Create a file in src/tools/ following the pattern in example.ts.
 * 2. Import and register it below.
 */
const registry = new ToolRegistry();

registry.register(calculatorTool);

export { registry };
