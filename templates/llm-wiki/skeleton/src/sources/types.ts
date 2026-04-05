export interface Source {
  id: string;           // content hash
  tenantId: string;
  ref: string;          // original reference (file path, URL, etc.)
  content: string;
  contentHash: string;
  ingestedAt: Date;
  provider: string;
}

export interface SourceProvider {
  readonly name: string;
  ingest(tenantId: string, ref: string): Promise<Source>;
  list(tenantId: string): Promise<Source[]>;
}
