import { beforeEach, describe, expect, it } from "vitest";
import { getLlmProvider } from "../llm/index.js";
import { getSourceProvider } from "../sources/index.js";
import { getStorageProvider } from "../storage/index.js";

/**
 * The in-memory providers.
 *
 * They ship, they are selectable through WIKI_LLM_PROVIDER,
 * WIKI_SOURCE_PROVIDER and WIKI_STORAGE_PROVIDER, and they carry branches — a
 * keyword dispatch, a missing-page refusal, a prefix-narrowed listing. A
 * branch nothing drives is behaviour nobody has seen, and these are the
 * branches a project runs on before it configures a real backend.
 *
 * Tenant isolation is asserted separately from those branches. Covering every
 * branch of a partition says the arms were driven, not that the partition
 * holds, so the isolation cases drive a tenant id chosen to defeat it.
 */

describe("mock llm provider", () => {
  const llm = () => getLlmProvider("mock");
  const ask = (content: string) => llm().complete([{ role: "user", content }]);

  it("says so when there is no user turn to answer", async () => {
    await expect(llm().complete([{ role: "system", content: "you are a wiki" }])).resolves.toMatch(
      /no user message/i,
    );
  });

  it("answers the last user turn, not the first", async () => {
    const answer = await llm().complete([
      { role: "user", content: "ingest this page" },
      { role: "assistant", content: "done" },
      { role: "user", content: "now answer my question" },
    ]);

    expect(answer).toBe("Mock answer based on wiki content.");
  });

  it("returns a page shape for an extraction turn", async () => {
    for (const prompt of ["please ingest", "extract the entity", "build a page"]) {
      const parsed = JSON.parse(await ask(prompt)) as Record<string, unknown>;
      expect(parsed).toMatchObject({ title: expect.any(String), type: expect.any(String) });
      expect(parsed).toHaveProperty("links");
    }
  });

  it("returns prose for a question turn", async () => {
    for (const prompt of ["query the wiki", "a question", "answer me"]) {
      await expect(ask(prompt)).resolves.toBe("Mock answer based on wiki content.");
    }
  });

  it("returns a contradiction report for a contradiction turn", async () => {
    const parsed = JSON.parse(await ask("find any contradictions")) as Record<string, unknown>;

    expect(parsed).toHaveProperty("contradictions");
    expect(parsed).toHaveProperty("summary");
  });

  it("falls back to a plain response for anything else", async () => {
    await expect(ask("something unrelated")).resolves.toBe("Mock LLM response.");
  });

  it("matches the keyword whatever case it arrives in", async () => {
    await expect(ask("QUERY THE WIKI")).resolves.toBe("Mock answer based on wiki content.");
  });
});

describe("mock source provider", () => {
  const sources = () => getSourceProvider("mock");

  it("lists nothing for a tenant that has ingested nothing", async () => {
    await expect(sources().list("tenant-with-no-sources")).resolves.toEqual([]);
  });

  it("returns the ingested source and lists it afterwards", async () => {
    const provider = sources();
    const source = await provider.ingest("acme", "docs/one.md");

    expect(source).toMatchObject({ tenantId: "acme", ref: "docs/one.md", provider: "mock" });
    expect(source.id).toBe(source.contentHash);
    await expect(provider.list("acme")).resolves.toContainEqual(source);
  });

  it("gives the same ref the same content hash, so re-ingest is recognisable", async () => {
    const provider = sources();
    const first = await provider.ingest("acme", "docs/same.md");
    const second = await provider.ingest("acme", "docs/same.md");

    expect(second.contentHash).toBe(first.contentHash);
  });

  it("keeps one tenant's sources out of another's list", async () => {
    const provider = sources();
    await provider.ingest("acme", "docs/private.md");

    await expect(provider.list("other")).resolves.toEqual([]);
  });
});

describe("mock storage provider", () => {
  let storage: ReturnType<typeof getStorageProvider>;

  beforeEach(() => {
    // A fresh provider per case: the registry hands back a new instance, so
    // one case's pages cannot answer another's search.
    storage = getStorageProvider("mock");
  });

  it("reads null for a page that was never written", async () => {
    await expect(storage.readPage("acme", "missing.md")).resolves.toBeNull();
  });

  it("reads back what it wrote", async () => {
    await storage.writePage("acme", "page.md", "hello", "add page");

    await expect(storage.readPage("acme", "page.md")).resolves.toBe("hello");
  });

  it("refuses to delete a page for a tenant it holds nothing for", async () => {
    await expect(storage.deletePage("acme", "missing.md", "remove")).rejects.toThrow(
      /Page not found/,
    );
  });

  it("refuses to delete a page a tenant it does hold pages for never wrote", async () => {
    await storage.writePage("acme", "page.md", "hello", "add");

    await expect(storage.deletePage("acme", "missing.md", "remove")).rejects.toThrow(
      /Page not found/,
    );
  });

  it("deletes a page it holds", async () => {
    await storage.writePage("acme", "page.md", "hello", "add");
    await storage.deletePage("acme", "page.md", "remove");

    await expect(storage.readPage("acme", "page.md")).resolves.toBeNull();
  });

  it("lists only markdown pages", async () => {
    await storage.writePage("acme", "page.md", "hello", "add");
    await storage.writePage("acme", "notes.txt", "hello", "add");

    await expect(storage.listPages("acme")).resolves.toEqual(["page.md"]);
  });

  it("narrows a listing by prefix", async () => {
    await storage.writePage("acme", "docs/one.md", "a", "add");
    await storage.writePage("acme", "other/two.md", "b", "add");

    await expect(storage.listPages("acme", "docs/")).resolves.toEqual(["docs/one.md"]);
  });

  it("keeps one tenant's pages out of another's listing", async () => {
    await storage.writePage("acme", "secret.md", "confidential", "add");

    await expect(storage.listPages("other")).resolves.toEqual([]);
  });

  it("searches content case-insensitively", async () => {
    await storage.writePage("acme", "page.md", "The Quick Brown Fox", "add");

    await expect(storage.search("acme", "quick brown")).resolves.toEqual(["page.md"]);
  });

  it("omits a page of the same tenant whose content does not match", async () => {
    await storage.writePage("acme", "match.md", "the quick brown fox", "add");
    await storage.writePage("acme", "miss.md", "nothing relevant here", "add");

    await expect(storage.search("acme", "quick")).resolves.toEqual(["match.md"]);
  });

  it("keeps one tenant's content out of another's search", async () => {
    await storage.writePage("acme", "secret.md", "confidential", "add");

    await expect(storage.search("other", "confidential")).resolves.toEqual([]);
  });

  it("gives a tenant no reach into another whose id is a prefix of its own", async () => {
    // The isolation is the whole of what a consumer gets from this provider,
    // and a tenant id arrives from a URL path segment, so it is chosen by
    // whoever makes the request. `acme:team` and `acme` are two tenants; the
    // path `team:secret.md` under the second spells the same thing as
    // `secret.md` under the first wherever the two are joined into one key.
    // Every operation the interface offers is driven from the crafted side,
    // because reaching a page is one defect and deleting it is another.
    await storage.writePage("acme", "team:secret.md", "confidential", "add");

    await expect(storage.readPage("acme:team", "secret.md")).resolves.toBeNull();
    await expect(storage.listPages("acme:team")).resolves.toEqual([]);
    await expect(storage.search("acme:team", "confidential")).resolves.toEqual([]);
    await expect(storage.deletePage("acme:team", "secret.md", "remove")).rejects.toThrow(
      /Page not found/,
    );

    // The page is still there and still its owner's: a refusal that also lost
    // the page would pass every assertion above.
    await expect(storage.readPage("acme", "team:secret.md")).resolves.toBe("confidential");
    await expect(storage.listPages("acme")).resolves.toEqual(["team:secret.md"]);

    // And the same in the other direction, so neither id is the privileged one.
    await storage.writePage("acme:team", "notes.md", "team notes", "add");

    await expect(storage.readPage("acme", "team:notes.md")).resolves.toBeNull();
    await expect(storage.listPages("acme")).resolves.toEqual(["team:secret.md"]);
    await expect(storage.search("acme", "team notes")).resolves.toEqual([]);
  });

  it("returns no history, which is what an in-memory store has", async () => {
    await expect(storage.getHistory("acme", "page.md")).resolves.toEqual([]);
  });
});
