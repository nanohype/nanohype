export interface PageMeta {
  title: string;
  type: string;
  sources: string[];
  createdAt: Date;
  updatedAt: Date;
  confidence: "sourced" | "inferred" | "stale";
}

export interface Page {
  path: string;
  meta: PageMeta;
  content: string;
}

export interface CrossRef {
  source: string;   // page path
  target: string;   // page path
  context: string;  // surrounding text
}

export interface Contradiction {
  pageA: string;
  pageB: string;
  claimA: string;
  claimB: string;
  severity: "low" | "medium" | "high";
}
