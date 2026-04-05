import { getConfig } from "../config.js";
import { getStorageProvider } from "../storage/index.js";
import { getLlmProvider } from "../llm/index.js";
import { parsePage, serializePage, createPage } from "../wiki/page.js";
import { searchPages } from "../wiki/search.js";
import { acquireWriteLock } from "./queue.js";
import type { Page, PageMeta } from "../wiki/types.js";
import type { QueryResult } from "./types.js";

interface LlmQueryResponse {
  answer: string;
  citations: { page: string; excerpt: string }[];
  suggestedPagePath?: string;
  suggestedPageTitle?: string;
  suggestedPageContent?: string;
}

function buildQuerySystemPrompt(): string {
  return `You are a knowledge wiki assistant. Answer questions using only the wiki pages provided as context.

## Rules
- Base your answer strictly on the content in the provided wiki pages.
- Cite specific pages for each claim in your answer.
- If the context does not contain enough information, say so clearly.
- When you identify structural gaps — topics that should have their own page but don't — suggest a discovery page.

## Response Format
Respond with valid JSON only. No markdown fences, no commentary.
{
  "answer": "Your detailed answer using information from the wiki pages.",
  "citations": [
    {
      "page": "page-path.md",
      "excerpt": "Relevant excerpt from the page supporting this part of the answer"
    }
  ],
  "suggestedPagePath": "optional-new-page.md",
  "suggestedPageTitle": "Optional New Page Title",
  "suggestedPageContent": "Optional markdown content for a discovery page"
}

Only include suggestedPagePath/Title/Content if you identify a genuine structural gap that a new page would fill. Most queries will not need a discovery page.`;
}

function buildContextBlock(pages: Page[]): string {
  return pages
    .map(
      (p) =>
        `--- PAGE: ${p.path} ---\nTitle: ${p.meta.title}\nType: ${p.meta.type}\n\n${p.content}\n--- END PAGE ---`,
    )
    .join("\n\n");
}

function parseQueryResponse(raw: string): LlmQueryResponse {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "");

  const parsed = JSON.parse(cleaned);

  if (typeof parsed.answer !== "string") {
    throw new Error("LLM response missing 'answer' string");
  }

  return {
    answer: parsed.answer,
    citations: Array.isArray(parsed.citations) ? parsed.citations : [],
    suggestedPagePath: parsed.suggestedPagePath,
    suggestedPageTitle: parsed.suggestedPageTitle,
    suggestedPageContent: parsed.suggestedPageContent,
  };
}

export async function query(
  tenantId: string,
  question: string,
  opts?: { fileDiscovery?: boolean },
): Promise<QueryResult> {
  const config = getConfig();
  const storage = getStorageProvider(config.WIKI_STORAGE_PROVIDER);
  const llm = getLlmProvider(config.WIKI_LLM_PROVIDER);

  const pagePaths = await storage.listPages(tenantId);
  const allPages: Page[] = [];

  for (const path of pagePaths) {
    const raw = await storage.readPage(tenantId, path);
    if (raw) {
      try {
        const page = parsePage(raw);
        page.path = path;
        allPages.push(page);
      } catch {
        // Skip unparseable pages
      }
    }
  }

  const relevant = searchPages(allPages, question).slice(0, 5);

  if (relevant.length === 0) {
    return {
      answer: "No relevant pages found in the wiki for this question.",
      citations: [],
    };
  }

  const contextBlock = buildContextBlock(relevant);
  const systemPrompt = buildQuerySystemPrompt();

  const response = await llm.complete([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Context:\n${contextBlock}\n\nQuestion: ${question}`,
    },
  ]);

  const queryData = parseQueryResponse(response);

  const result: QueryResult = {
    answer: queryData.answer,
    citations: queryData.citations,
  };

  if (
    opts?.fileDiscovery &&
    queryData.suggestedPagePath &&
    queryData.suggestedPageTitle &&
    queryData.suggestedPageContent
  ) {
    const now = new Date();
    const meta: PageMeta = {
      title: queryData.suggestedPageTitle,
      type: "concept",
      sources: [],
      createdAt: now,
      updatedAt: now,
      confidence: "inferred",
    };

    const page = createPage(queryData.suggestedPagePath, meta, queryData.suggestedPageContent);
    const serialized = serializePage(page);

    const release = await acquireWriteLock(tenantId);
    try {
      await storage.writePage(
        tenantId,
        queryData.suggestedPagePath,
        serialized,
        `Discovery page: ${queryData.suggestedPageTitle}`,
      );
    } finally {
      release();
    }

    result.discoveryPage = queryData.suggestedPagePath;
  }

  return result;
}
