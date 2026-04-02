import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { ToolRegistry, type Tool } from "../tools/registry.js";

function makeTool(name: string, schema?: z.ZodObject<z.ZodRawShape>): Tool {
  return {
    name,
    description: `A test tool called ${name}`,
    inputSchema: schema ?? z.object({ value: z.string() }),
    execute: async (input) => `result: ${JSON.stringify(input)}`,
  };
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("registers a tool", () => {
    const tool = makeTool("echo");
    registry.register(tool);

    expect(registry.names()).toContain("echo");
  });

  it("retrieves a tool by name", () => {
    const tool = makeTool("lookup");
    registry.register(tool);

    const found = registry.get("lookup");
    expect(found).toBeDefined();
    expect(found!.name).toBe("lookup");
    expect(found!.description).toBe("A test tool called lookup");
  });

  it("lists all registered tools", () => {
    registry.register(makeTool("alpha"));
    registry.register(makeTool("beta"));
    registry.register(makeTool("gamma"));

    const tools = registry.list();
    const names = tools.map((t) => t.name);

    expect(names).toEqual(["alpha", "beta", "gamma"]);
  });

  it("executes a tool with valid input", async () => {
    const schema = z.object({ query: z.string() });
    const tool: Tool = {
      name: "search",
      description: "Search tool",
      inputSchema: schema,
      execute: async (input) => `found: ${input.query}`,
    };
    registry.register(tool);

    const result = await registry.execute("search", { query: "hello" });
    expect(result).toBe("found: hello");
  });

  it("returns an error string for invalid input", async () => {
    const schema = z.object({ count: z.number() });
    registry.register({
      name: "counter",
      description: "Counter tool",
      inputSchema: schema,
      execute: async (input) => `count: ${input.count}`,
    });

    const result = await registry.execute("counter", { count: "not-a-number" });
    expect(result).toMatch(/^Error: invalid input for tool "counter"/);
  });

  it("throws when getting an unknown tool", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("returns an error string when executing an unknown tool", async () => {
    const result = await registry.execute("ghost", {});
    expect(result).toMatch(/^Error: unknown tool "ghost"/);
  });

  it("throws when registering a duplicate tool name", () => {
    registry.register(makeTool("dup"));
    expect(() => registry.register(makeTool("dup"))).toThrow(
      'Tool "dup" is already registered',
    );
  });
});
