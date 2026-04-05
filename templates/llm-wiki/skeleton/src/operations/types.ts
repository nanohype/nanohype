export interface IngestResult {
  sourceId: string;
  pagesCreated: string[];
  pagesUpdated: string[];
  contradictions: { pageA: string; pageB: string; claim: string }[];
  skipped: boolean;
}

export interface QueryResult {
  answer: string;
  citations: { page: string; excerpt: string }[];
  discoveryPage?: string;
}

export interface LintIssue {
  severity: "info" | "warning" | "error";
  type: "orphan" | "contradiction" | "stale" | "broken-link" | "schema-violation";
  message: string;
  page?: string;
}

export interface LintResult {
  issues: LintIssue[];
  pagesChecked: number;
  healthy: boolean;
}
