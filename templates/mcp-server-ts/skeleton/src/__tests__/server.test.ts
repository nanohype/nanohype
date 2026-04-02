import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

describe("MCP server", () => {
  let client: Client;

  beforeEach(async () => {
    const server = createServer();

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(clientTransport);
  });

  it("creates and connects without error", () => {
    expect(client).toBeDefined();
  });

  it("lists the greet tool", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain("greet");
  });

  it("exposes the greet tool with a valid input schema", async () => {
    const { tools } = await client.listTools();
    const greet = tools.find((t) => t.name === "greet");

    expect(greet).toBeDefined();
    expect(greet!.description).toBeTruthy();
    expect(greet!.inputSchema).toBeDefined();
    expect(greet!.inputSchema.type).toBe("object");
    expect(greet!.inputSchema.properties).toHaveProperty("name");
  });

  it("lists the server-info resource", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);

    expect(uris).toContain("info://server");
  });

  it("can invoke the greet tool through the full server", async () => {
    const result = await client.callTool({
      name: "greet",
      arguments: { name: "Integration" },
    });

    expect(result.isError).toBeFalsy();
    const block = (result.content as Array<{ type: string; text: string }>)[0];
    expect(block.type).toBe("text");
    expect(block.text).toContain("Integration");
  });
});
