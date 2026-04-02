# Reference Architecture: MCP Ecosystem

**Status:** Reference
**Audience:** Template users evaluating MCP templates, developers building or consuming MCP servers

---

## 1. What Is MCP?

The Model Context Protocol (MCP) is an open protocol that standardizes how LLM applications connect to external tools and data sources. It replaces ad-hoc tool integrations (custom function calling, bespoke API wrappers) with a uniform interface that any compliant client can use with any compliant server.

The core idea: **separate tool implementation from tool consumption.** A tool author builds an MCP server once. Any MCP-compatible host (Claude Desktop, an IDE, a custom agent) can connect to it without bespoke integration code.

MCP was released by Anthropic in late 2024 and has seen rapid adoption across the AI tooling ecosystem. The protocol specification is open and maintained at `modelcontextprotocol.io`.

### 1.1 Why MCP Exists

Before MCP, every LLM application that needed tool access had to define its own tool schema format, write custom integration code for each tool, and re-implement all of this for each new host application. This is the N x M problem: N hosts times M tools equals N*M integrations. MCP reduces this to N + M — each host implements the client protocol once, each tool implements the server protocol once.

### 1.2 MCP vs REST APIs vs Libraries

**MCP server** — a process that exposes tools, resources, and prompts via the MCP protocol. Discovered and invoked dynamically by LLM applications.

**REST API** — a web service with HTTP endpoints. The LLM application needs custom code to call it, and the LLM needs a tool definition describing each endpoint.

**Library/SDK** — code imported directly into the application. Tightest coupling, best performance, no network overhead.

| Criterion | MCP Server | REST API | Library |
|---|---|---|---|
| Discovery | Protocol-native (capability negotiation) | External (docs, OpenAPI spec) | Import statement |
| LLM integration | Native (tools, resources, prompts) | Requires wrapper | Requires wrapper |
| Deployment | Sidecar process or remote service | Remote service | In-process |
| Language coupling | None (protocol-based) | None (HTTP-based) | Same language |
| Composability | Multiple servers via multi-server clients | Manual aggregation | Manual aggregation |
| Overhead | Process communication (stdio/HTTP) | Network (HTTP) | None (function call) |
| Best for | LLM tool integration | General API access | Performance-critical, single-app use |

**Build an MCP server** when the tool will be used by multiple LLM applications, when you want it to be discoverable and self-describing, or when the tool is I/O-bound. **Build a REST API** when the service is consumed by non-LLM applications too, or when you need HTTP semantics. **Use a library** when performance is critical, the tool is only used by one application, or you need compile-time type safety.

---

## 2. Architecture

MCP uses a three-layer architecture: Host, Client, and Server.

```text
┌─────────────────────────────────────────────┐
│                 Host Application             │
│  (Claude Desktop, IDE, Custom Agent)         │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ MCP      │  │ MCP      │  │ MCP      │  │
│  │ Client 1 │  │ Client 2 │  │ Client 3 │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
└───────┼──────────────┼──────────────┼────────┘
        │              │              │
   ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐
   │ MCP      │  │ MCP      │  │ MCP      │
   │ Server A │  │ Server B │  │ Server C │
   │ (files)  │  │ (git)    │  │ (db)     │
   └──────────┘  └──────────┘  └──────────┘
```

### 2.1 Host Application

The program the user interacts with. It contains the LLM integration and one or more MCP clients. Responsibilities: managing client lifecycle, routing tool calls from the LLM to the appropriate client, aggregating tools/resources/prompts from all connected servers, enforcing security policies, and managing the LLM conversation.

### 2.2 MCP Client

A protocol-level component inside the host. Each client maintains a 1:1 connection to a single MCP server. It handles transport setup, protocol initialization, sending requests, receiving responses, and connection health. A host typically has multiple clients, one per server, and aggregates across them to present a unified set of capabilities to the LLM.

### 2.3 MCP Server

A process that implements the server side of the protocol. It exposes **Tools** (actions the LLM can invoke), **Resources** (data the LLM can read), and **Prompts** (reusable prompt templates). A server is typically focused on one domain — file system, Git, database, a specific API. This keeps servers small, composable, and independently deployable.

---

## 3. Transport Options

MCP supports multiple transport mechanisms. The transport is independent of the protocol — the same server logic works over any transport.

### 3.1 stdio (Local)

The server runs as a child process of the host. Communication happens over stdin/stdout using JSON-RPC messages, one per line. The host manages the server process lifecycle (start, kill).

**Characteristics:**

- No network. Everything runs locally.
- Simplest to set up — just a command to run in the host config.
- Suitable for local tools (file system, Git, local databases).

### 3.2 Streamable HTTP (Remote, Current)

The current recommended transport for remote servers. The server exposes an HTTP endpoint (typically `/mcp`). The client sends JSON-RPC requests as HTTP POST and receives responses. For streaming responses or server-initiated messages, the server uses Server-Sent Events (SSE) within the HTTP response.

**Characteristics:**

- Works over the network. Server can run anywhere.
- Supports authentication (headers, tokens) and session management.
- Compatible with standard HTTP infrastructure (load balancers, proxies, TLS).
- Replaced the older SSE transport in the 2025 protocol revisions.

### 3.3 SSE (Remote, Legacy)

The original remote transport. Used two HTTP endpoints: a GET endpoint that opens an SSE stream for server-to-client messages, and a POST endpoint for client-to-server messages. Still supported by many implementations but being superseded by Streamable HTTP.

**When to use:** Only if you need compatibility with older clients/servers that have not adopted Streamable HTTP.

### 3.4 Choosing a Transport

| Factor | stdio | Streamable HTTP |
|---|---|---|
| Server location | Same machine as host | Anywhere (local or remote) |
| Setup complexity | Low (just a command) | Medium (HTTP server) |
| Authentication | Not needed (local process) | Required (tokens, OAuth) |
| Scalability | One instance per host | Shared across hosts |
| Network dependency | None | Yes |
| Best for | Local dev tools, file access, Git | Shared services, team tools, cloud APIs |

---

## 4. Server Primitives

An MCP server exposes three types of primitives. Each serves a different purpose in LLM interaction.

### 4.1 Tools (Actions)

Tools are functions the LLM can call to perform actions or computations. They are the most commonly used primitive.

A tool has:

- A unique name
- A human-readable description (this is part of the LLM prompt — write it well)
- An input schema (JSON Schema)
- An execution function that returns results

```typescript
server.tool(
  "search_files",
  "Search for files matching a glob pattern in the project directory. " +
  "Returns a list of matching file paths.",
  {
    pattern: z.string().describe("Glob pattern, e.g. '**/*.ts'"),
    path: z.string().optional().describe("Directory to search in. Defaults to project root.")
  },
  async ({ pattern, path }) => {
    const results = await glob(pattern, { cwd: path ?? projectRoot });
    return {
      content: [{ type: "text", text: results.join("\n") }]
    };
  }
);
```

**Tool design principles:**

- **Names should be verbs** — `search_files`, `run_query`, `create_issue`. The LLM uses the name to decide which tool to call.
- **Descriptions are prompt engineering** — they tell the LLM when and how to use the tool. Be specific about what the tool does, what it returns, and when to use it vs other tools.
- **Fewer parameters are better** — each parameter is a decision the LLM must make. Provide defaults where possible.
- **Return structured content** — use the content array with typed entries (text, image, resource links).

### 4.2 Resources (Data)

Resources are data the LLM can read. Unlike tools, resources are not actions — they are content that can be pulled into the conversation context.

A resource has:

- A URI (unique identifier)
- A name and description
- A MIME type
- Content (text or binary)

A resource handler returns a `contents` array, each entry with a URI, MIME type, and text content. For example, a config resource at `config://app/settings` returns the current application configuration as JSON.

**Resource types:**

- **Static resources** — listed explicitly, content changes infrequently. The host can fetch the list once and cache it.
- **Dynamic resources** — content changes based on state. The server exposes a URI template and resolves it on request.
- **Resource templates** — parameterized URIs (e.g., `file:///{path}`) that accept arguments. The host fills in the parameters.

**URI schemes:**

MCP does not mandate a URI scheme. Common conventions:

| Scheme | Use |
|---|---|
| `file:///` | Local file access |
| `db://` | Database records |
| `config://` | Configuration data |
| `https://` | Web resources |
| Custom (e.g., `jira://`, `slack://`) | Domain-specific resources |

### 4.3 Prompts (Templates)

Prompts are reusable prompt templates that the server provides. They help users invoke common workflows without writing prompts from scratch.

A prompt has:

- A name
- A description
- Optional arguments
- A function that returns a list of messages

A prompt handler takes arguments and returns a messages array. For example, an `explain_code` prompt takes `code` and optional `language` arguments and returns a user message asking the LLM to explain the code in detail.

Prompts are less commonly implemented than tools and resources but useful for standardizing interactions. The host presents available prompts to the user (e.g., in a slash-command menu).

---

## 5. Input Validation and Error Handling

### 5.1 Input Validation with Zod / JSON Schema

The TypeScript MCP SDK uses Zod for input validation. The Python SDK uses Pydantic or raw JSON Schema. In both cases, the schema serves two purposes:

1. **Tells the LLM** what arguments to provide (sent as part of the tool definition)
2. **Validates at runtime** that the arguments match expectations

```typescript
// TypeScript with Zod
const SearchInput = z.object({
  query: z.string().min(1).max(500).describe("Search query"),
  limit: z.number().int().min(1).max(100).default(10).describe("Max results"),
  filters: z.object({
    dateAfter: z.string().datetime().optional(),
    category: z.enum(["docs", "code", "issues"]).optional()
  }).optional()
});
```

```python
# Python with Pydantic
class SearchInput(BaseModel):
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    limit: int = Field(default=10, ge=1, le=100, description="Max results")
    filters: Optional[SearchFilters] = None
```

### 5.2 Structured Output

Tool results use MCP's content format:

```typescript
// Text result
return {
  content: [{ type: "text", text: "Search found 3 results:\n..." }]
};

// Error result
return {
  isError: true,
  content: [{ type: "text", text: "Search failed: connection timeout" }]
};

// Multiple content blocks
return {
  content: [
    { type: "text", text: "Found the following image:" },
    { type: "image", data: base64Data, mimeType: "image/png" }
  ]
};
```

### 5.3 Error Handling

MCP distinguishes between protocol-level errors and tool-level errors.

**Protocol errors** — malformed requests, unknown methods, server crashes. These are JSON-RPC errors with standard error codes.

```json
{
  "jsonrpc": "2.0",
  "error": { "code": -32601, "message": "Method not found" },
  "id": 1
}
```

**Tool errors** — the tool executed but something went wrong (file not found, API failure, invalid input). Return these as tool results with `isError: true`, not as protocol errors. This lets the LLM see the error and potentially recover. Wrap every tool handler in try/catch and return `{ isError: true, content: [{ type: "text", text: "descriptive error message" }] }` on failure.

**Guidelines:**

- Never let exceptions propagate unhandled — they crash the server or produce opaque protocol errors
- Always set `isError: true` on error results so the host and LLM know the tool failed
- Include actionable information in error messages (what went wrong, what the LLM might try instead)
- Log errors server-side for debugging (stderr for stdio transport, standard logging for HTTP)

---

## 6. Resource Design

### 6.1 URI Schemes

Design URIs that are intuitive and predictable.

```text
# Good: clear scheme, hierarchical, readable
file:///src/main.ts
db://users/123
jira://PROJECT-456

# Avoid: opaque identifiers, no hierarchy
resource://abc123def
data://x
```

### 6.2 Dynamic Resources

Resources whose content changes based on application state (e.g., current Git status, live config). The server registers them with the same `server.resource()` API but the handler computes content on demand rather than returning static data.

### 6.3 Resource Subscriptions

Servers can notify clients when a resource changes. The client subscribes to a URI, and the server sends a `notifications/resources/updated` notification when the content updates. The host can then re-fetch the resource. This is useful for resources that change frequently (log files, metrics, live config).

---

## 7. Multi-Server Composition

A single host typically connects to multiple MCP servers. Each server provides tools for a different domain.

### 7.1 Architecture

```text
Host
├── Client A → File System Server (read, write, search files)
├── Client B → Git Server (status, diff, commit, log)
├── Client C → Database Server (query, schema, migrations)
└── Client D → Jira Server (create issue, search, update)
```

The host aggregates all tools from all servers into a single tool list that is presented to the LLM. The LLM does not know which server provides which tool — it just sees a flat list of available tools.

### 7.2 Namespacing

When multiple servers expose tools with similar names, the host needs a namespacing strategy. The common approaches are server-prefixed names (e.g., `filesystem.read_file`, `git.status`) or relying on inherently unique names across servers. Prefixing is more robust; unique names are simpler but require coordination between server authors.

### 7.3 Practical Considerations

- **Startup order** — servers can start in parallel. The host waits for all to complete initialization before presenting tools to the LLM.
- **Failure isolation** — if one server crashes, the others should continue working. The host should degrade gracefully (remove that server's tools, retry connection).
- **Configuration** — each server has its own config (command, args, env vars) in a single host config file.

---

## 8. Server Lifecycle

MCP servers follow a defined lifecycle with protocol-level handshakes.

### 8.1 Initialization

A three-step handshake: the client sends `initialize` (protocol version, client capabilities), the server responds with its capabilities and info, and the client sends `initialized` to confirm. This negotiates the protocol version and what features each side supports. After `initialized`, the connection is ready for normal operation.

### 8.2 Capability Negotiation

The server declares what it supports in its `initialize` response: a `capabilities` object listing supported features (`tools`, `resources`, `prompts`, `logging`, etc.) and a `serverInfo` object with name and version. The client only uses features the server declares. If the server omits `resources`, the client will not try to list or read resources.

### 8.3 Normal Operation

After initialization, the client sends requests and the server responds. Key methods: `tools/list` (enumerate tools), `tools/call` (invoke a tool), `resources/list` (enumerate resources), `resources/read` (fetch resource content), `prompts/list` and `prompts/get` (work with prompt templates). Servers can also send notifications to clients (resource updates, log messages, progress reports) without a request.

### 8.4 Shutdown

For stdio: the host kills the child process. For HTTP: the client stops sending requests and the connection closes. There is no explicit shutdown handshake. Implement cleanup handlers (close database connections, flush logs) on process exit regardless of transport.

---

## 9. Security Model

### 9.1 Capability-Based Security

MCP's security model is **capability-based** — the server declares what it can do, and the host/user decides what to allow.

- The server lists its tools, resources, and prompts.
- The host presents these to the user.
- The user (or host policy) approves or denies specific capabilities.

This is different from traditional authentication-based security. The question is not "who is calling?" but "what is this server allowed to do?"

### 9.2 User-in-the-Loop Tool Approval

Hosts should require user approval before executing tool calls, especially for tools with side effects. Approval patterns range from per-call approval (safest, most disruptive) to per-session approval (approve once per tool per session) to allowlists (pre-approve read-only tools, require confirmation for writes). A practical default: auto-approve reads, confirm writes.

### 9.3 Transport Security

- **stdio** — inherits the security of the host process. The server runs with the same permissions as the host. No network exposure.
- **Streamable HTTP** — use TLS (HTTPS). Authenticate clients with tokens (Bearer auth, OAuth). Do not expose MCP HTTP endpoints without authentication.

### 9.4 Environment Variables and Secrets

MCP servers often need credentials (API keys, database URLs). Pass these via environment variables in the host config, not via tool arguments.

**Rules:**

- Never hardcode secrets in server source code
- Never expose secrets in tool descriptions or resource content
- Use environment variables or a secrets manager
- If a tool result contains a secret (e.g., from a database query), sanitize it before returning

### 9.5 Input Sanitization

Tool inputs come from LLM output, which can be influenced by adversarial content (prompt injection via retrieved documents, user-provided data, etc.). Treat all tool inputs as untrusted. Validate inputs against the schema. Sanitize paths (no `../../etc/passwd` traversal). For shell commands, always parameterize — pass arguments as an array, never interpolate into a command string. For SQL, use parameterized queries.

---

## 10. When to Build an MCP Server

### 10.1 Good Candidates

Internal tools used across multiple AI applications, data sources that LLMs need to query (databases, knowledge bases, monitoring), external APIs you want to expose to LLM interactions (Jira, GitHub, Slack), and domain-specific actions (deploy, test, analyze) that benefit from LLM orchestration.

### 10.2 Poor Candidates

Performance-critical operations (sub-millisecond latency), one-off scripts for a single application, simple computations the LLM can do directly, and operations requiring complex UI interaction.

### 10.3 Build Checklist

When building an MCP server:

- [ ] Define the domain clearly — one server, one domain
- [ ] Write tool descriptions as if they are part of the LLM prompt (they are)
- [ ] Validate all inputs with schemas (Zod, Pydantic, JSON Schema)
- [ ] Handle errors gracefully — return `isError: true` results, never crash
- [ ] Support stdio transport at minimum (broadest compatibility)
- [ ] Add Streamable HTTP if the server will be shared or remote
- [ ] Test with at least one real host application (Claude Desktop, a custom agent)
- [ ] Document required environment variables
- [ ] Implement proper shutdown handling
- [ ] Consider what happens when the LLM sends unexpected or adversarial inputs

---

## 11. Server Implementation Patterns

### 11.1 TypeScript (MCP SDK)

The reference implementation language. Create a `McpServer` instance, register tools and resources with `server.tool()` and `server.resource()`, then connect a transport (`StdioServerTransport` for stdio, or the HTTP transport for remote). Tool inputs use Zod schemas. Tool results use the `{ content: [{ type: "text", text: "..." }] }` format.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

server.tool(
  "greet",
  "Generate a greeting for a person",
  { name: z.string().describe("Person's name") },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}!` }]
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 11.2 Python (MCP SDK)

Use the `Server` class with decorator-based registration (`@server.list_tools()`, `@server.call_tool()`). Tool input schemas are raw JSON Schema dicts or Pydantic models. Run via `stdio_server()` context manager.

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
import mcp.types as types

server = Server("my-server")

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [types.Tool(
        name="greet",
        description="Generate a greeting for a person",
        inputSchema={
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"]
        }
    )]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name == "greet":
        return [types.TextContent(type="text", text=f"Hello, {arguments['name']}!")]
    raise ValueError(f"Unknown tool: {name}")
```

### 11.3 Project Structure

Keep tool implementations separate from protocol boilerplate. A typical structure: `src/index.ts` for server setup and transport binding, `src/tools/` for tool implementations (one file per domain), `src/resources/` for resource implementations, and `src/lib/` for shared utilities. The entry point wires everything together; the actual logic lives in `tools/` and `resources/`.

---

## 12. Implementation Checklist

When evaluating or extending an MCP template, verify these are addressed:

- [ ] Server metadata (name, version) set correctly for capability negotiation
- [ ] All tools have descriptive names and detailed descriptions
- [ ] Input schemas defined with Zod (TypeScript) or JSON Schema (Python)
- [ ] All tool handlers have try/catch with `isError: true` error results
- [ ] Resources use meaningful URI schemes
- [ ] stdio transport supported (minimum viable transport)
- [ ] Streamable HTTP transport supported if the server will be remote
- [ ] Environment variables documented for any required credentials
- [ ] No secrets in tool descriptions, resource content, or error messages
- [ ] Path traversal and injection attacks considered in input handling
- [ ] Graceful shutdown on SIGTERM / process exit
- [ ] Tested with a real MCP host (Claude Desktop or equivalent)
- [ ] README documents available tools, resources, and setup instructions
