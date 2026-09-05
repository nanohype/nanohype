/**
 * Eval runner for __PROJECT_NAME__.
 *
 * Runs each case in the corpus through the configured chunk strategy and
 * embedding provider, then checks the case's assertions against the split and
 * the vectors it produced. Chunking and embedding are where a document's
 * meaning either survives or does not, and neither is deterministic across
 * providers or models, so a unit test around them says nothing about what a
 * consumer's index will hold.
 *
 * This calls a provider and costs money. It is run on demand — `npm run eval`
 * — rather than in CI.
 */

import { resolve } from "node:path";
import type { EmbeddingProvider } from "../embed/types.js";
import type { ChunkStrategy } from "../transform/types.js";
import type { Document } from "../types.js";
import { type AssertionResult, type ChunkedOutput, checkAssertion } from "./assertions.js";
import { coversBothKinds, EmptyCorpusError, type EvalCase, loadCases } from "./cases.js";

// The same knobs the pipeline reads, so the eval measures the configuration a
// consumer ships rather than one written for the corpus.
const CHUNK_STRATEGY = process.env.CHUNK_STRATEGY ?? "__CHUNK_STRATEGY__";
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER ?? "__EMBEDDING_PROVIDER__";
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 512);
const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP ?? 64);

interface CaseResult {
  name: string;
  assertions: AssertionResult[];
  error?: string;
}

function optionalNumber(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value);
}

/** A document id a reader can trace back to the case that produced it. */
function documentId(name: string): string {
  return `eval-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

async function main(): Promise<void> {
  const casesDir = resolve(import.meta.dirname, "cases");

  // `loadCases` throws on an empty corpus rather than returning one, so an
  // eval that has nothing to run cannot report the same thing as an eval that
  // ran everything and passed.
  const cases = await loadCases(casesDir);

  // Both barrels pull in provider SDKs, and building an embedding provider
  // needs credentials. Reading the corpus before importing them means a run
  // with nothing to run says so, instead of failing first on a vendor error
  // about a missing key.
  const { getStrategy } = await import("../transform/index.js");
  const { getEmbeddingProvider } = await import("../embed/index.js");

  if (!coversBothKinds(cases)) {
    console.error(
      "The corpus covers only one kind of case. Golden cases say where the pipeline puts a " +
        "boundary in a document that has one; adversarial cases are the ones that find out " +
        "what it does with a document built to break the split.",
    );
    process.exit(1);
  }

  const strategy = getStrategy(CHUNK_STRATEGY);
  const embedder = getEmbeddingProvider(
    EMBEDDING_PROVIDER,
    process.env.EMBEDDING_MODEL,
    optionalNumber(process.env.EMBEDDING_DIMENSIONS),
    optionalNumber(process.env.EMBEDDING_BATCH_SIZE),
  );

  console.log(
    `Running ${cases.length} case(s) through ${strategy.name} chunking and ${embedder.name} ` +
      `embeddings (chunkSize=${CHUNK_SIZE}, overlap=${CHUNK_OVERLAP})...\n`,
  );

  const results: CaseResult[] = [];

  for (const evalCase of cases) {
    process.stdout.write(`  [${evalCase.kind}] ${evalCase.name} ... `);

    try {
      const assertions = await runCase(evalCase, strategy, embedder);
      const allPassed = assertions.every((a) => a.pass);

      results.push({ name: evalCase.name, assertions });
      console.log(allPassed ? "PASS" : "FAIL");

      if (!allPassed) {
        for (const assertion of assertions) {
          if (!assertion.pass) {
            console.log(`    FAIL: ${assertion.message}`);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name: evalCase.name, assertions: [], error: message });
      console.log("ERROR");
      console.log(`    ${message}`);
    }
  }

  const totalAssertions = results.reduce((sum, r) => sum + r.assertions.length, 0);
  const passedAssertions = results.reduce(
    (sum, r) => sum + r.assertions.filter((a) => a.pass).length,
    0,
  );
  const failed = results.filter((r) => r.error || r.assertions.some((a) => !a.pass));

  console.log("\n--- Summary ---");
  console.log(
    `Cases: ${results.length} total, ${results.length - failed.length} passed, ${failed.length} failed`,
  );
  console.log(
    `Assertions: ${totalAssertions} total, ${passedAssertions} passed, ${totalAssertions - passedAssertions} failed`,
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

/** Chunk and embed one case's document, then check what the case asserts. */
async function runCase(
  evalCase: EvalCase,
  strategy: ChunkStrategy,
  embedder: EmbeddingProvider,
): Promise<AssertionResult[]> {
  const document: Document = {
    id: documentId(evalCase.name),
    content: evalCase.input,
    metadata: { evalCase: evalCase.name, evalKind: evalCase.kind },
  };

  const chunks = strategy.chunk(document, { chunkSize: CHUNK_SIZE, overlap: CHUNK_OVERLAP });
  const embeddings =
    chunks.length > 0 ? await embedder.embedBatch(chunks.map((c) => c.content)) : [];
  const output: ChunkedOutput = { chunks, embeddings, dimensions: embedder.dimensions };

  const results: AssertionResult[] = [];
  for (const assertion of evalCase.assertions) {
    results.push(await checkAssertion(assertion, output, (text) => embedder.embed(text)));
  }
  return results;
}

main().catch((err: unknown) => {
  if (err instanceof EmptyCorpusError) {
    console.error(err.message);
    process.exit(1);
  }
  console.error("Eval runner failed:", err);
  process.exit(1);
});
