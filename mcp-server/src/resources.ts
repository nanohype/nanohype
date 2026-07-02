import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  CatalogSource,
  CONTRACT_REPOS,
  isCatalogName,
  isContractRepo,
  isStandardName,
  loadCatalog,
  loadStandard,
  loadStandards,
  STANDARD_NAMES,
} from '@nanohype/sdk';

interface StaticResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Pure helper exposed for tests. Returns the list of `resources/list`
 * entries the server advertises before any read. Static across the
 * server's lifetime — actual values are fetched lazily on read.
 */
export function listResources(): StaticResource[] {
  const resources: StaticResource[] = [
    {
      uri: 'nanohype://catalog',
      name: 'nanohype catalog',
      description:
        'The full catalog.json manifest — every template and composite available on the nanohype stack with metadata.',
      mimeType: 'application/json',
    },
    {
      uri: 'nanohype://standards',
      name: 'nanohype standards (bundle)',
      description:
        'All published standards files bundled under one resource. Includes language toolchain, version currency, platform-tenant contract, LLM policy, quality-rubric dimension names, the testing rubric, and the resource-tagging taxonomy.',
      mimeType: 'application/json',
    },
  ];

  for (const name of STANDARD_NAMES) {
    resources.push({
      uri: `nanohype://standards/${name}`,
      name: `standard: ${name}`,
      description: `The '${name}' standard as published JSON. See standards/README.md for the human-readable normative form.`,
      mimeType: 'application/json',
    });
  }

  for (const { repo, visibility } of CONTRACT_REPOS) {
    const access =
      visibility === 'private' ? ' (private — requires a GitHub token to resolve)' : '';
    resources.push({
      uri: `nanohype://contracts/${repo}`,
      name: `contract: ${repo}`,
      description: `The agent-facing AGENTS.md for the '${repo}' repo${access}. Five-minute orientation: what the repo gives you, contract surface, how to add a new thing, conventions, pointers.`,
      mimeType: 'text/markdown',
    });
  }

  return resources;
}

/**
 * Pure helper exposed for tests. Resolves a `nanohype://...` URI against
 * the source. Returns the contents shape the MCP server hands back on a
 * `resources/read` request.
 */
export async function readResource(
  source: CatalogSource,
  uri: string,
): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
  if (uri === 'nanohype://catalog') {
    const catalog = await loadCatalog(source);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(catalog, null, 2),
        },
      ],
    };
  }

  if (uri === 'nanohype://standards') {
    const bundle = await loadStandards(source);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(bundle, null, 2),
        },
      ],
    };
  }

  const standardMatch = /^nanohype:\/\/standards\/(.+)$/.exec(uri);
  if (standardMatch) {
    const name = standardMatch[1];
    if (!isStandardName(name)) {
      throw new Error(`Unknown standard: ${name}`);
    }
    const standard = await loadStandard(source, name);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(standard, null, 2),
        },
      ],
    };
  }

  const contractMatch = /^nanohype:\/\/contracts\/(.+)$/.exec(uri);
  if (contractMatch) {
    const repo = contractMatch[1];
    if (!isContractRepo(repo)) {
      throw new Error(`Unknown repo: ${repo}`);
    }
    const content = await source.fetchContract(repo);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: content,
        },
      ],
    };
  }

  const templateMatch = /^nanohype:\/\/template\/(.+)$/.exec(uri);
  if (templateMatch) {
    const name = templateMatch[1];
    // LLM-constructed URI — hold the name to the catalog naming rule before
    // it reaches a source (which interpolates it into paths/URLs).
    if (!isCatalogName(name)) {
      throw new Error(`Invalid template name: ${name}`);
    }
    const { manifest } = await source.fetchTemplate(name);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(manifest, null, 2),
        },
      ],
    };
  }

  const compositeMatch = /^nanohype:\/\/composite\/(.+)$/.exec(uri);
  if (compositeMatch) {
    const name = compositeMatch[1];
    if (!isCatalogName(name)) {
      throw new Error(`Invalid composite name: ${name}`);
    }
    const manifest = await source.fetchComposite(name);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(manifest, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unrecognized resource URI: ${uri}`);
}

/**
 * Wire the resource handlers onto an MCP server. The `nanohype://template/{name}`
 * and `nanohype://composite/{name}` URIs are not listed up-front (the
 * full catalog goes through the catalog resource); they're discoverable
 * via the tools and resolvable directly when an LLM constructs the URI.
 */
export function registerResources(server: Server, source: CatalogSource): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    return readResource(source, uri);
  });
}
