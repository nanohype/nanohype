import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerExampleTool } from "../tools/example.js";

describe("greet tool", () => {
  let client: Client;

  beforeEach(async () => {
    const server = new McpServer({ name: "test-server", version: "0.0.1" });
    registerExampleTool(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(clientTransport);
  });

  it("returns a greeting with default enthusiasm", async () => {
    const result = await client.callTool({ name: "greet", arguments: { name: "Alice" } });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: "text", text: "Hello, Alice! Welcome to __SERVER_NAME__." },
    ]);
  });

  it("returns a low-enthusiasm greeting", async () => {
    const result = await client.callTool({
      name: "greet",
      arguments: { name: "Bob", enthusiasm: "low" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: "Hello, Bob." }]);
  });

  it("returns a high-enthusiasm greeting", async () => {
    const result = await client.callTool({
      name: "greet",
      arguments: { name: "Carol", enthusiasm: "high" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      {
        type: "text",
        text: "HELLO, Carol!!! SO GREAT to have you here at __SERVER_NAME__!!! \u{1f389}",
      },
    ]);
  });

  it("returns content array with type and text fields", async () => {
    const result = await client.callTool({ name: "greet", arguments: { name: "Dana" } });

    expect(result.content).toBeInstanceOf(Array);
    expect(result.content).toHaveLength(1);

    const block = (result.content as Array<{ type: string; text: string }>)[0];
    expect(block).toHaveProperty("type", "text");
    expect(block).toHaveProperty("text");
    expect(typeof block.text).toBe("string");
  });

  it("handles single-character names", async () => {
    const result = await client.callTool({ name: "greet", arguments: { name: "X" } });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: "text", text: "Hello, X! Welcome to __SERVER_NAME__." },
    ]);
  });

  it("handles names with unicode characters", async () => {
    const result = await client.callTool({
      name: "greet",
      arguments: { name: "M\u00fcller" },
    });

    expect(result.isError).toBeFalsy();
    const block = (result.content as Array<{ type: string; text: string }>)[0];
    expect(block.text).toContain("M\u00fcller");
  });
});
