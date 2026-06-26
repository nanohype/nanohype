# @nanohype/mcp

MCP server exposing the [nanohype Platform Reference](../docs/platform-reference.md) — catalog, standards, and per-repo agent contracts — as resources and tools any MCP-capable client can mount.

Use it when you're building an AI client (Bedrock agent, Claude Desktop assistant, custom orchestrator) that needs to discover what templates exist, what the production bar looks like, or what's in a specific repo's `AGENTS.md` — and you'd rather have an MCP transport than fetch JSON manually.

## Resources

| URI | What it returns | MIME |
|---|---|---|
| `nanohype://catalog` | Full `catalog.json` (templates + composites with metadata) | `application/json` |
| `nanohype://standards` | All five standards files bundled | `application/json` |
| `nanohype://standards/{name}` | One standards file. `name` ∈ `language-toolchain` / `version-currency` / `platform-tenant-contract` / `llm-policy` / `quality-rubric-dimensions` | `application/json` |
| `nanohype://contracts/{repo}` | One repo's `AGENTS.md`. `repo` ∈ `nanohype` / `landing-zone` / `eks-gitops` / `eks-agent-platform` / `kx` / `cloudgov` / `fab` / `portal` / `eks-fleet` (private — needs a GitHub token) | `text/markdown` |
| `nanohype://template/{name}` | One template's full manifest (variables, conditionals, hooks, composition) | `application/json` |
| `nanohype://composite/{name}` | One composite's full manifest (multi-template orchestration) | `application/json` |

## Tools

| Tool | Inputs | What it does |
|---|---|---|
| `search_templates` | `query` (required), `category?`, `persona?`, `kind?` | Filter the catalog. Substring match on name + displayName + description + tags |
| `get_template` | `name` | Full template manifest |
| `get_composite` | `name` | Full composite manifest |
| `list_standards` | — | Names of the five published standards |
| `get_standard` | `name` | One standards file's JSON |
| `get_contract` | `repo` | One repo's `AGENTS.md` content as markdown |

## Configuration

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `NANOHYPE_SOURCE` | `github` | `github` reads from the GitHub API. `local` reads from a local checkout |
| `NANOHYPE_ROOT` | — | Path to a local `nanohype/nanohype` checkout. Required when `NANOHYPE_SOURCE=local` |
| `NANOHYPE_REPO` | `nanohype/nanohype` | GitHub repo (owner/name) when using the github source |
| `NANOHYPE_REF` | `main` | Git ref to read from |
| `NANOHYPE_GITHUB_TOKEN` | — | Optional GitHub API token. Lifts the public-rate-limit ceiling and unlocks private repos if the catalog ever moves |

## Claude Desktop

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%/Claude/claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "nanohype": {
      "command": "npx",
      "args": ["-y", "@nanohype/mcp"]
    }
  }
}
```

Then restart Claude Desktop. The model can now ask "list templates in the ai-systems category" or "show me the platform-tenant contract" and the MCP layer hands back parsed JSON.

To run against a local checkout instead of GitHub:

```jsonc
{
  "mcpServers": {
    "nanohype": {
      "command": "npx",
      "args": ["-y", "@nanohype/mcp"],
      "env": {
        "NANOHYPE_SOURCE": "local",
        "NANOHYPE_ROOT": "/path/to/nanohype/nanohype"
      }
    }
  }
}
```

## Claude API (tool-use, programmatic)

Run the MCP server as a subprocess and mount its tools into a Claude API session via the Anthropic SDK's MCP support:

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const message = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  mcp_servers: [
    {
      type: "stdio",
      name: "nanohype",
      command: "npx",
      args: ["-y", "@nanohype/mcp"],
    },
  ],
  messages: [
    {
      role: "user",
      content:
        "I need a RAG pipeline template. List the matching options in the catalog, then fetch the full manifest for the best one.",
    },
  ],
});
```

The model picks `search_templates` + `get_template` from the MCP tools list automatically.

## AWS Bedrock agents

Bedrock agents with MCP support register external servers via the Bedrock console's agent action group configuration. Use the `@nanohype/mcp` stdio command as the action source:

1. In the Bedrock console, edit the agent and add an action group with type "Function details".
2. Provide the function schemas matching the `listTools()` output — the MCP server's tools list maps 1:1 to Bedrock function definitions.
3. Configure the action group to invoke a Lambda that proxies to the MCP server's stdio (or use AWS's MCP-compatible runtime when available).

Until Bedrock's first-class MCP runtime is generally available, the simplest path is to point the Bedrock agent at a Lambda wrapping `@nanohype/sdk` directly — same surface as MCP, lower indirection. The SDK exports `loadCatalog`, `loadStandard`, `loadStandards`, `loadContract`, and `loadAllContracts` — identical to what this MCP server wraps.

## Local development

```sh
npm install --ignore-scripts
npm test
npm run build

# Try it locally (Local source — points at the nanohype repo)
NANOHYPE_SOURCE=local NANOHYPE_ROOT=$(realpath ..) node dist/index.js
```

## See also

- [Platform Reference](../docs/platform-reference.md) — the full picture
- [`@nanohype/sdk`](../sdk/README.md) — programmatic surface this server wraps
- [`AGENTS.md`](../AGENTS.md) — agent-facing entry point for the nanohype repo
