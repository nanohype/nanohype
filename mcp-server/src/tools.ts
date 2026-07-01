import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  CATALOG_NAME_PATTERN,
  CatalogSource,
  isCatalogName,
  isContractRepo,
  isStandardName,
  KNOWN_CONTRACT_REPOS,
  loadCatalog,
  loadStandard,
  STANDARD_NAMES,
  type CatalogTemplate,
  type ContractRepo,
  type StandardName,
} from '@nanohype/sdk';

interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Pure helper exposed for tests. The exact tool list the server advertises
 * on `tools/list`. Stable across the server's lifetime.
 */
export function listTools(): ToolDescriptor[] {
  return [
    {
      name: 'search_templates',
      description:
        'Search the catalog for templates matching a query. Optional category, persona, and kind filters narrow the result. Returns a compact list — call `get_template` to fetch full manifests.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Free-text query matched against template name, displayName, description, and tags. Case-insensitive substring match. Empty string returns all templates (subject to other filters).',
          },
          category: {
            type: 'string',
            description:
              "Filter to a specific category: 'ai-systems', 'applications', 'infrastructure', 'composable-modules', 'design', 'qa', 'product', 'marketing', 'sales', 'operations', 'customer-success'.",
          },
          persona: {
            type: 'string',
            description:
              "Filter to a specific persona (e.g., 'engineering', 'design', 'qa', 'product').",
          },
          kind: {
            type: 'string',
            enum: ['template', 'brief'],
            description:
              "Filter to either 'template' (scaffolds files) or 'brief' (produces agent instruction documents).",
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_template',
      description:
        'Fetch a single template manifest by name. Returns the full template.yaml content including variables, conditionals, hooks, composition rules, and prerequisites.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The template name (kebab-case).' },
        },
        required: ['name'],
      },
    },
    {
      name: 'get_composite',
      description:
        'Fetch a single composite manifest by name. Returns the multi-template orchestration manifest including variables and the template list with entry conditions.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The composite name (kebab-case).' },
        },
        required: ['name'],
      },
    },
    {
      name: 'list_standards',
      description:
        'Enumerate the published standards files. Returns the canonical names; call `get_standard` to fetch one.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_standard',
      description:
        'Fetch a single standards file by name. Returns the full JSON including kind, version, title, summary, and content.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            enum: STANDARD_NAMES,
            description: 'The standard name.',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'get_contract',
      description:
        "Fetch a repo's AGENTS.md content. Use this when you need the agent-facing contract surface for a specific repo (what it gives you, how to add a new thing, conventions). Every contract repo is public; a future private one would resolve only when the server has a GitHub token.",
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            enum: [...KNOWN_CONTRACT_REPOS],
            description: 'The repo name.',
          },
        },
        required: ['repo'],
      },
    },
  ];
}

/**
 * Pure helper exposed for tests. Run a search over a loaded catalog with
 * the given criteria. Case-insensitive substring match on the query
 * against name + displayName + description + tag list.
 */
export function searchTemplates(
  templates: CatalogTemplate[],
  args: { query: string; category?: string; persona?: string; kind?: string },
): CatalogTemplate[] {
  const q = args.query.toLowerCase();
  return templates.filter((t) => {
    if (args.category && t.category !== args.category) return false;
    if (args.persona && !(t.persona ?? []).includes(args.persona)) return false;
    if (args.kind && t.kind !== args.kind) return false;
    if (q === '') return true;
    const haystack = [t.name, t.displayName, t.description, ...t.tags].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * The MCP tool-result shape. `isError: true` marks a tool-level failure.
 * A type alias (not an interface) so it carries an implicit index signature
 * and stays assignable to the MCP SDK's `ServerResult` union.
 */
export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: true;
};

/**
 * Marker for a tool name the server never advertised. Per the MCP spec an
 * unknown tool is a protocol error, not a tool result — so this is the one
 * failure `callTool` re-throws instead of folding into `isError: true`.
 */
class UnknownToolError extends Error {}

// ── Argument validation ─────────────────────────────────────────────────────
// Tool arguments arrive from an LLM client and the declared inputSchema is
// advisory — nothing in the protocol enforces it. Every argument is
// re-validated here before it reaches a source: names against the catalog
// naming rule, standards and contract repos against their closed sets.
// Violations throw plain Errors, which `callTool` converts into `isError`
// results with the message intact so the calling LLM can self-correct.

function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  return `${JSON.stringify(value)} (${typeof value})`;
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new Error(`Invalid argument '${key}': expected a string, got ${describeValue(value)}`);
  }
  return value;
}

function optionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  if (args[key] === undefined) return undefined;
  return stringArg(args, key);
}

function catalogNameArg(args: Record<string, unknown>): string {
  const value = stringArg(args, 'name');
  if (!isCatalogName(value)) {
    throw new Error(
      `Invalid argument 'name': ${describeValue(value)} is not a valid catalog name (must match ${CATALOG_NAME_PATTERN})`,
    );
  }
  return value;
}

function standardNameArg(args: Record<string, unknown>): StandardName {
  const value = stringArg(args, 'name');
  if (!isStandardName(value)) {
    throw new Error(
      `Invalid argument 'name': ${describeValue(value)} is not a known standard (expected one of: ${STANDARD_NAMES.join(', ')})`,
    );
  }
  return value;
}

function contractRepoArg(args: Record<string, unknown>): ContractRepo {
  const value = stringArg(args, 'repo');
  if (!isContractRepo(value)) {
    throw new Error(
      `Invalid argument 'repo': ${describeValue(value)} is not a known contract repo (expected one of: ${KNOWN_CONTRACT_REPOS.join(', ')})`,
    );
  }
  return value;
}

function kindArg(args: Record<string, unknown>): 'template' | 'brief' | undefined {
  const value = optionalStringArg(args, 'kind');
  if (value === undefined || value === 'template' || value === 'brief') return value;
  throw new Error(
    `Invalid argument 'kind': ${describeValue(value)} (expected 'template' or 'brief')`,
  );
}

/**
 * Pure helper exposed for tests. Dispatch a tool call to the right handler.
 * Unknown tools throw (a protocol error — the client called something the
 * server never advertised). Everything a known tool does wrong — bad
 * arguments, a missing template, an upstream fetch failure — comes back as
 * an `isError: true` result so MCP clients handle it as a tool failure
 * instead of a broken connection.
 */
export async function callTool(
  source: CatalogSource,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  try {
    return await dispatchTool(source, name, args);
  } catch (err) {
    if (err instanceof UnknownToolError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}

async function dispatchTool(
  source: CatalogSource,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case 'search_templates': {
      const criteria = {
        query: stringArg(args, 'query'),
        category: optionalStringArg(args, 'category'),
        persona: optionalStringArg(args, 'persona'),
        kind: kindArg(args),
      };
      const catalog = await loadCatalog(source);
      const results = searchTemplates(catalog.templates, criteria);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
    case 'get_template': {
      const { manifest } = await source.fetchTemplate(catalogNameArg(args));
      return { content: [{ type: 'text', text: JSON.stringify(manifest, null, 2) }] };
    }
    case 'get_composite': {
      const manifest = await source.fetchComposite(catalogNameArg(args));
      return { content: [{ type: 'text', text: JSON.stringify(manifest, null, 2) }] };
    }
    case 'list_standards': {
      return { content: [{ type: 'text', text: JSON.stringify(STANDARD_NAMES, null, 2) }] };
    }
    case 'get_standard': {
      const standard = await loadStandard(source, standardNameArg(args));
      return { content: [{ type: 'text', text: JSON.stringify(standard, null, 2) }] };
    }
    case 'get_contract': {
      const content = await source.fetchContract(contractRepoArg(args));
      return { content: [{ type: 'text', text: content }] };
    }
    default:
      throw new UnknownToolError(`Unknown tool: ${name}`);
  }
}

/** Wire the tool handlers onto an MCP server. */
export function registerTools(server: Server, source: CatalogSource): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return callTool(source, name, args ?? {});
  });
}
