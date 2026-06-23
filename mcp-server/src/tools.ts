import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  CatalogSource,
  KNOWN_CONTRACT_REPOS,
  loadCatalog,
  loadStandard,
  type CatalogTemplate,
  type ContractRepo,
  type StandardName,
} from '@nanohype/sdk';

const STANDARD_NAMES: StandardName[] = [
  'language-toolchain',
  'version-currency',
  'platform-tenant-contract',
  'llm-policy',
  'quality-rubric-dimensions',
  'testing-rubric',
  'resource-tagging',
  'observability-slo',
];

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
        "Fetch a repo's AGENTS.md content. Use this when you need the agent-facing contract surface for a specific repo (what it gives you, how to add a new thing, conventions).",
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
 * Pure helper exposed for tests. Dispatch a tool call to the right handler.
 * Returns the MCP tool-result shape (`{ content: [{ type, text }] }`).
 */
export async function callTool(
  source: CatalogSource,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ content: { type: 'text'; text: string }[] }> {
  switch (name) {
    case 'search_templates': {
      const catalog = await loadCatalog(source);
      const results = searchTemplates(catalog.templates, {
        query: String(args.query ?? ''),
        category: args.category as string | undefined,
        persona: args.persona as string | undefined,
        kind: args.kind as string | undefined,
      });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
    case 'get_template': {
      const { manifest } = await source.fetchTemplate(String(args.name));
      return { content: [{ type: 'text', text: JSON.stringify(manifest, null, 2) }] };
    }
    case 'get_composite': {
      const manifest = await source.fetchComposite(String(args.name));
      return { content: [{ type: 'text', text: JSON.stringify(manifest, null, 2) }] };
    }
    case 'list_standards': {
      return { content: [{ type: 'text', text: JSON.stringify(STANDARD_NAMES, null, 2) }] };
    }
    case 'get_standard': {
      const standard = await loadStandard(source, args.name as StandardName);
      return { content: [{ type: 'text', text: JSON.stringify(standard, null, 2) }] };
    }
    case 'get_contract': {
      const repo = args.repo as ContractRepo;
      const content = await source.fetchContract(repo);
      return { content: [{ type: 'text', text: content }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
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
