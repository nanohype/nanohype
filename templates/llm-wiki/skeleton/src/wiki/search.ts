import type { Page } from "./types.js";

interface ScoredPage {
  page: Page;
  score: number;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "was", "were", "are", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "of", "in", "to", "for",
  "with", "on", "at", "from", "by", "as", "into", "about", "between",
  "through", "during", "before", "after", "and", "but", "or", "nor",
  "not", "so", "yet", "both", "either", "neither", "each", "every",
  "all", "any", "few", "more", "most", "other", "some", "such", "no",
  "only", "own", "same", "than", "too", "very", "just", "because",
  "when", "where", "why", "how", "what", "which", "who", "whom",
  "this", "that", "these", "those", "it", "its",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export function searchPages(pages: Page[], query: string): Page[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const scored: ScoredPage[] = [];

  for (const page of pages) {
    let score = 0;
    const titleLower = page.meta.title.toLowerCase();
    const contentLower = page.content.toLowerCase();
    const sourcesText = page.meta.sources.join(" ").toLowerCase();

    for (const term of terms) {
      if (titleLower.includes(term)) score += 10;
      if (contentLower.includes(term)) score += 5;
      if (sourcesText.includes(term)) score += 3;
    }

    if (score > 0) {
      scored.push({ page, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.page);
}
