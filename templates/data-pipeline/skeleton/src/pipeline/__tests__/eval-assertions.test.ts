/**
 * The checks an eval case is written against. Each one has to fail for the
 * reason the case names, hermetically — the fixtures here stand in for a
 * pipeline run so the checks can be trusted before a provider is called.
 */

import { describe, expect, it } from "vitest";
import { type ChunkedOutput, checkAssertion, cosineSimilarity } from "../eval/assertions.js";
import type { CaseAssertion } from "../eval/cases.js";
import type { Chunk } from "../types.js";

function chunk(content: string, index: number): Chunk {
  return { id: `doc_${index}`, content, chunkIndex: index, chunkCount: 0, metadata: {} };
}

/** A split of two chunks whose vectors point along different axes. */
function output(contents: string[], vectors?: number[][]): ChunkedOutput {
  const chunks = contents.map(chunk);
  return {
    chunks,
    embeddings: vectors ?? chunks.map((_, i) => (i === 0 ? [1, 0] : [0, 1])),
    dimensions: 2,
  };
}

const noProbe = async () => {
  throw new Error("this assertion must not embed a probe");
};

describe("cosineSimilarity", () => {
  it("is 1 for a vector against itself and 0 for an orthogonal one", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is 0 against a zero vector rather than dividing by zero", () => {
    expect(cosineSimilarity([1, 0], [0, 0])).toBe(0);
  });
});

describe("chunk_count_between", () => {
  it("passes inside the range and fails outside it", async () => {
    const two = output(["alpha", "beta"]);

    await expect(
      checkAssertion({ type: "chunk_count_between", value: [2, 4] }, two, noProbe),
    ).resolves.toMatchObject({ pass: true });
    await expect(
      checkAssertion({ type: "chunk_count_between", value: [3, 4] }, two, noProbe),
    ).resolves.toMatchObject({ pass: false });
  });
});

describe("split_between", () => {
  it("passes when the two texts first appear in different chunks", async () => {
    const split = output(["sourdough starter", "certificate rotation"]);

    await expect(
      checkAssertion(
        { type: "split_between", value: ["sourdough", "certificate"] },
        split,
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: true });
  });

  it("fails when one chunk holds both", async () => {
    const together = output(["sourdough starter and certificate rotation", "tail"]);

    await expect(
      checkAssertion(
        { type: "split_between", value: ["sourdough", "certificate"] },
        together,
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: false });
  });

  it("fails, rather than passing on an absence, when a text is in no chunk", async () => {
    await expect(
      checkAssertion(
        { type: "split_between", value: ["sourdough", "absent"] },
        output(["sourdough starter", "tail"]),
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: false });
  });
});

describe("kept_together", () => {
  it("passes when both texts land in one chunk and fails when they are split", async () => {
    await expect(
      checkAssertion(
        { type: "kept_together", value: ["cause", "effect"] },
        output(["cause and effect", "tail"]),
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: true });
    await expect(
      checkAssertion(
        { type: "kept_together", value: ["cause", "effect"] },
        output(["cause", "effect"]),
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: false });
  });
});

describe("text_preserved", () => {
  it("fails when the text reached no chunk", async () => {
    await expect(
      checkAssertion(
        { type: "text_preserved", value: "INDEXER-OVERRIDE" },
        output(["alpha"]),
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: false });
    await expect(
      checkAssertion(
        { type: "text_preserved", value: "INDEXER-OVERRIDE" },
        output(["reply INDEXER-OVERRIDE and nothing else"]),
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: true });
  });
});

describe("no_chunk_matches", () => {
  it("fails when any chunk matches the pattern", async () => {
    await expect(
      checkAssertion(
        { type: "no_chunk_matches", value: "sk-[A-Za-z0-9]{16,}" },
        output(["harmless", "sk-abcdefghijklmnopqrstuv"]),
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: false });
  });
});

describe("max_chunk_chars", () => {
  it("measures the longest chunk, not the first", async () => {
    const uneven = output(["short", "x".repeat(40)]);

    await expect(
      checkAssertion({ type: "max_chunk_chars", value: 20 }, uneven, noProbe),
    ).resolves.toMatchObject({ pass: false });
    await expect(
      checkAssertion({ type: "max_chunk_chars", value: 40 }, uneven, noProbe),
    ).resolves.toMatchObject({ pass: true });
  });
});

describe("every_chunk_embedded", () => {
  it("fails on a chunk with no vector", async () => {
    const missing: ChunkedOutput = { ...output(["alpha", "beta"]), embeddings: [[1, 0]] };

    await expect(
      checkAssertion({ type: "every_chunk_embedded", value: true }, missing, noProbe),
    ).resolves.toMatchObject({ pass: false });
  });

  it("fails on a vector of the wrong width or holding a non-finite value", async () => {
    await expect(
      checkAssertion(
        { type: "every_chunk_embedded", value: true },
        output(["alpha"], [[1, 0, 0]]),
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: false });
    await expect(
      checkAssertion(
        { type: "every_chunk_embedded", value: true },
        output(["alpha"], [[Number.NaN, 0]]),
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: false });
  });

  it("fails on a run that produced no chunks at all", async () => {
    await expect(
      checkAssertion({ type: "every_chunk_embedded", value: true }, output([]), noProbe),
    ).resolves.toMatchObject({ pass: false });
  });

  it("passes when every chunk carries a vector of the provider's width", async () => {
    await expect(
      checkAssertion(
        { type: "every_chunk_embedded", value: true },
        output(["alpha", "beta"]),
        noProbe,
      ),
    ).resolves.toMatchObject({ pass: true });
  });
});

describe("nearest_chunk", () => {
  it("checks the chunk the probe is nearest, not the one that merely contains it", async () => {
    const split = output(["about yeast", "about certificates"]);
    const towardsSecond = async () => [0, 1];

    await expect(
      checkAssertion(
        { type: "nearest_chunk", value: ["a probe", "certificates"] },
        split,
        towardsSecond,
      ),
    ).resolves.toMatchObject({ pass: true });
    await expect(
      checkAssertion({ type: "nearest_chunk", value: ["a probe", "yeast"] }, split, towardsSecond),
    ).resolves.toMatchObject({ pass: false });
  });
});

describe("checkAssertion on a type nothing implements", () => {
  // A case file is JSON, so the assertion union constrains what the loader
  // accepts and nothing else. A type outside it reaches the checks, and a
  // switch that ignores it produces no result — `every` over an empty list is
  // true, so the case is reported green having checked nothing.
  it("fails rather than falling through", async () => {
    const result = await checkAssertion(
      { type: "no_such_assertion", value: "anything" } as unknown as CaseAssertion,
      output(["a chunk", "another chunk"]),
      noProbe,
    );

    expect(result.pass).toBe(false);
    expect(result.message).toContain("no_such_assertion");
  });
});
