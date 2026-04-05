export interface PageTypeDefinition {
  name: string;
  description: string;
  requiredSections: string[];
}

export interface WikiSchema {
  name: string;
  description: string;
  pageTypes: PageTypeDefinition[];
  structure: {
    index: string;
    orphanThresholdDays: number;
    contradictionPolicy: "flag" | "warn" | "reject";
  };
  llm: {
    provider: string;
    model: string;
    temperature: number;
    maxPagesPerIngest: number;
  };
}
