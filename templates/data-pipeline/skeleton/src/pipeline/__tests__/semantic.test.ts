/**
 * Tests for the semantic chunking strategy.
 *
 * Covers where boundaries land, the floor that stops a document of short,
 * varied sentences coming back one chunk per sentence, and the fallback for
 * text that offers no sentence boundary to cut on.
 */

import { describe, expect, it } from "vitest";
import { getStrategy } from "../transform/index.js";
import type { Document } from "../types.js";

function makeDoc(content: string, id = "test-doc"): Document {
  return { id, content, metadata: { source: "test" } };
}

const TWO_SUBJECTS = [
  "A sourdough starter is a culture of wild yeast and lactic acid bacteria in flour and water. ",
  "Bakers feed the starter on a schedule so the culture keeps producing gas. ",
  "A starter left unfed turns acidic and the dough it leavens spreads instead of rising. ",
  "Warmth shifts the balance towards the bacteria and the flavour drifts sour.\n\n",
  "Certificate rotation replaces a TLS key pair before the certificate that binds it expires. ",
  "The old chain and the new one overlap so clients holding a cached chain keep validating. ",
  "Automation installs the replacement and reloads the listener without dropping connections. ",
  "Expiry monitoring reads the certificate the listener serves rather than the file on disk.",
].join("");

/** Short sentences sharing almost no vocabulary: a boundary scores everywhere. */
const VARIED_SENTENCES = Array.from(
  { length: 40 },
  (_, i) => `Item ${i} concerns ${["quartz", "bridges", "orchards", "ledgers"][i % 4]}.`,
).join(" ");

const NO_SENTENCE_BOUNDARY = Array.from(
  { length: 60 },
  (_, i) => `clause ${i} joined by a comma to the next one`,
).join(", ");

describe("semantic chunking strategy", () => {
  it("is registered and retrievable", () => {
    expect(getStrategy("semantic").name).toBe("semantic");
  });

  it("returns text within the budget as a single chunk", () => {
    const chunks = getStrategy("semantic").chunk(makeDoc(TWO_SUBJECTS), { chunkSize: 512 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkCount).toBe(1);
  });

  it("puts a boundary where the subject changes", () => {
    const chunks = getStrategy("semantic").chunk(makeDoc(TWO_SUBJECTS), {
      chunkSize: 100,
      overlap: 0,
    });

    const yeast = chunks.findIndex((c) => c.content.includes("wild yeast"));
    const rotation = chunks.findIndex((c) => c.content.includes("Certificate rotation"));

    expect(yeast).toBe(0);
    expect(rotation).toBeGreaterThan(yeast);
  });

  it("does not return one chunk per sentence when every boundary scores", () => {
    // Grouping on similarity alone splits at almost every sentence here, and a
    // vector over one short sentence is close to every query and answers none.
    const chunks = getStrategy("semantic").chunk(makeDoc(VARIED_SENTENCES), {
      chunkSize: 64,
      overlap: 0,
    });

    expect(chunks.length).toBeLessThan(VARIED_SENTENCES.split(". ").length / 2);
    for (const c of chunks.slice(0, -1)) {
      expect(c.content.length).toBeGreaterThanOrEqual(64);
    }
  });

  it("splits text offering no sentence boundary to the chunk budget", () => {
    const chunks = getStrategy("semantic").chunk(makeDoc(NO_SENTENCE_BOUNDARY), {
      chunkSize: 128,
      overlap: 0,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(128 * 4);
    }
  });

  it("keeps no chunk above the budget when a group runs long", () => {
    const chunks = getStrategy("semantic").chunk(makeDoc(TWO_SUBJECTS), {
      chunkSize: 40,
      overlap: 0,
    });

    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(40 * 4);
    }
  });

  it("numbers chunks and carries document metadata forward", () => {
    const chunks = getStrategy("semantic").chunk(makeDoc(TWO_SUBJECTS, "my-doc"), {
      chunkSize: 100,
      overlap: 0,
    });

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].id).toBe(`my-doc_${i}`);
      expect(chunks[i].chunkIndex).toBe(i);
      expect(chunks[i].chunkCount).toBe(chunks.length);
      expect(chunks[i].metadata.source).toBe("test");
    }
  });

  it("returns no chunks for whitespace-only text", () => {
    expect(getStrategy("semantic").chunk(makeDoc("   \n\n  "), { chunkSize: 512 })).toHaveLength(0);
  });

  it("applies overlap between chunks", () => {
    const strategy = getStrategy("semantic");
    const none = strategy.chunk(makeDoc(TWO_SUBJECTS), { chunkSize: 100, overlap: 0 });
    const some = strategy.chunk(makeDoc(TWO_SUBJECTS), { chunkSize: 100, overlap: 16 });

    const chars = (cs: { content: string }[]) => cs.reduce((n, c) => n + c.content.length, 0);
    expect(chars(some)).toBeGreaterThan(chars(none));
  });
});
