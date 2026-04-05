import { createHash } from "crypto";
import type { Source, SourceProvider } from "./types.js";
import { registerSourceProvider } from "./registry.js";

class MockSourceProvider implements SourceProvider {
  readonly name = "mock";
  private readonly sources = new Map<string, Source[]>();

  async ingest(tenantId: string, ref: string): Promise<Source> {
    const content = `Mock content for ${ref}`;
    const contentHash = createHash("sha256").update(content, "utf-8").digest("hex");

    const source: Source = {
      id: contentHash,
      tenantId,
      ref,
      content,
      contentHash,
      ingestedAt: new Date(),
      provider: "mock",
    };

    const existing = this.sources.get(tenantId) ?? [];
    existing.push(source);
    this.sources.set(tenantId, existing);

    return source;
  }

  async list(tenantId: string): Promise<Source[]> {
    return this.sources.get(tenantId) ?? [];
  }
}

registerSourceProvider("mock", () => new MockSourceProvider());
