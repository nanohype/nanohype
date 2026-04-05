export interface PageCommit {
  sha: string;
  message: string;
  timestamp: Date;
}

export interface StorageProvider {
  readonly name: string;
  readPage(tenantId: string, path: string): Promise<string | null>;
  writePage(tenantId: string, path: string, content: string, message: string): Promise<void>;
  deletePage(tenantId: string, path: string, message: string): Promise<void>;
  listPages(tenantId: string, prefix?: string): Promise<string[]>;
  search(tenantId: string, query: string): Promise<string[]>;
  getHistory(tenantId: string, path: string, limit?: number): Promise<PageCommit[]>;
}
