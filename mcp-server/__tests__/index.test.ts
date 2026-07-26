import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GitHubSource, LocalSource } from "@nanohype/sdk";
import { describe, expect, it } from "vitest";
import { createServer, makeSource } from "../src/index.js";

const CATALOG_ROOT = resolve(import.meta.dirname, "..", "..");

describe("makeSource", () => {
  it("defaults to the public catalog on GitHub", () => {
    // No env at all is the shipped default: an MCP client that installs the
    // server and sets nothing must still resolve the public catalog.
    const source = makeSource({});
    expect(source).toBeInstanceOf(GitHubSource);
  });

  it("honours the repo and ref overrides", () => {
    const source = makeSource({
      NANOHYPE_REPO: "someone/fork",
      NANOHYPE_REF: "v1.2.3",
      NANOHYPE_GITHUB_TOKEN: "ghp_example",
    });
    expect(source).toBeInstanceOf(GitHubSource);
  });

  it("reads a local checkout when asked", () => {
    const source = makeSource({ NANOHYPE_SOURCE: "local", NANOHYPE_ROOT: CATALOG_ROOT });
    expect(source).toBeInstanceOf(LocalSource);
  });

  // The failure mode this prevents: NANOHYPE_SOURCE=local with no root would
  // otherwise fall through to GitHub, and the operator would see the public
  // catalog while believing they were serving their own checkout. Failing loudly
  // and naming the missing variable is the only safe outcome.
  it("refuses local mode without a root instead of falling back to GitHub", () => {
    expect(() => makeSource({ NANOHYPE_SOURCE: "local" })).toThrow(/NANOHYPE_ROOT/);
  });

  it("treats any other NANOHYPE_SOURCE value as the GitHub default", () => {
    expect(makeSource({ NANOHYPE_SOURCE: "github" })).toBeInstanceOf(GitHubSource);
    expect(makeSource({ NANOHYPE_SOURCE: "" })).toBeInstanceOf(GitHubSource);
  });
});

describe("createServer", () => {
  // A server that came up with only half its handlers wired would answer
  // tools/list and then fail every resources/* call. Driving a real client over
  // a linked in-memory transport asserts what a client actually gets, rather
  // than that createServer returned an object.
  it("answers both the tool and the resource surfaces", async () => {
    const source = makeSource({ NANOHYPE_SOURCE: "local", NANOHYPE_ROOT: CATALOG_ROOT });
    const server = createServer(source);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);

      const resources = await client.listResources();
      expect(resources.resources.map((r) => r.uri)).toContain("nanohype://catalog");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
