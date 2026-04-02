import type { z } from "zod";

/**
 * A tool that the agent can call. Each tool has a name, a description
 * (shown to the LLM), a Zod schema for input validation, and an async
 * execute function that returns a string result.
 */
export interface Tool<TSchema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  /** Unique tool name. Used by the LLM to request execution. */
  name: string;

  /** Human-readable description. Included in the tool list sent to the LLM. */
  description: string;

  /** Zod schema for input validation. */
  inputSchema: TSchema;

  /** Execute the tool with validated input and return a string result. */
  execute: (input: z.infer<TSchema>) => Promise<string>;
}

/**
 * Central registry for agent tools. Handles registration, lookup, and
 * execution with input validation.
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /** Register a tool. Throws if a tool with the same name already exists. */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Get a tool by name. Returns undefined if not found. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** List all registered tools. */
  list(): Tool[] {
    return [...this.tools.values()];
  }

  /** Get all tool names. */
  names(): string[] {
    return [...this.tools.keys()];
  }

  /**
   * Execute a tool by name with the given input. Validates the input
   * against the tool's Zod schema before execution.
   *
   * Returns the string result on success, or an error message string
   * on failure (never throws — errors are returned to the LLM as text).
   */
  async execute(name: string, input: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Error: unknown tool "${name}". Available tools: ${this.names().join(", ")}`;
    }

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return `Error: invalid input for tool "${name}": ${issues}`;
    }

    try {
      return await tool.execute(parsed.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error executing tool "${name}": ${message}`;
    }
  }
}
