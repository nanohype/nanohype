#!/usr/bin/env node
/**
 * @nanohype/mcp — MCP server exposing the nanohype Platform Reference.
 *
 * Resources surface the read-only manifests:
 *   - nanohype://catalog                        the full catalog.json
 *   - nanohype://standards                      list of standard names
 *   - nanohype://standards/{name}               one standard's JSON
 *   - nanohype://contracts/{repo}               one repo's AGENTS.md content
 *   - nanohype://template/{name}                a single template's manifest
 *   - nanohype://composite/{name}               a single composite's manifest
 *
 * Tools provide search + lookup endpoints any MCP-capable LLM can call:
 *   - search_templates(query, category?, persona?, kind?)
 *   - get_template(name)
 *   - get_composite(name)
 *   - list_standards()
 *   - get_standard(name)
 *   - get_contract(repo)
 *
 * Transport: stdio (default — works with Claude Desktop, Claude API tool-use,
 * any MCP-capable client).
 *
 * Source resolution: by default reads from the nanohype repo on GitHub
 * (https://github.com/nanohype/nanohype). Override with environment
 * variables:
 *   NANOHYPE_SOURCE=local            use a local checkout (default for tests)
 *   NANOHYPE_ROOT=<path>             path to the local nanohype repo
 *   NANOHYPE_REPO=<owner/repo>       GitHub repo (default nanohype/nanohype)
 *   NANOHYPE_REF=<ref>               git ref (default main)
 *   NANOHYPE_GITHUB_TOKEN=<token>    optional GitHub API token for higher rate limits
 */

import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type CatalogSource, GitHubSource, LocalSource } from "@nanohype/sdk";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

/**
 * The version a client reads from `initialize` is the published package's.
 * package.json sits one directory above both src/ and dist/, and npm ships it
 * in every tarball whatever `files` lists.
 */
export const SERVER_VERSION: string = createRequire(import.meta.url)("../package.json").version;

export function makeSource(env: NodeJS.ProcessEnv = process.env): CatalogSource {
  if (env.NANOHYPE_SOURCE === "local") {
    const rootDir = env.NANOHYPE_ROOT;
    if (!rootDir) {
      throw new Error(
        "NANOHYPE_SOURCE=local requires NANOHYPE_ROOT to point at a local nanohype checkout",
      );
    }
    return new LocalSource({ rootDir });
  }
  return new GitHubSource({
    repo: env.NANOHYPE_REPO ?? "nanohype/nanohype",
    ref: env.NANOHYPE_REF ?? "main",
    token: env.NANOHYPE_GITHUB_TOKEN,
  });
}

export function createServer(source: CatalogSource): Server {
  const server = new Server(
    { name: "@nanohype/mcp", version: SERVER_VERSION },
    { capabilities: { resources: {}, tools: {} } },
  );
  registerResources(server, source);
  registerTools(server, source);
  return server;
}

async function main(): Promise<void> {
  const source = makeSource();
  const server = createServer(source);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run as bin when invoked directly; do nothing on import (tests).
const invokedAsBin =
  import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("nanohype-mcp");
if (invokedAsBin) {
  main().catch((err: unknown) => {
    console.error("[@nanohype/mcp] fatal:", err);
    process.exit(1);
  });
}
