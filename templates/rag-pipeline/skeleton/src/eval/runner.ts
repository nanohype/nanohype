/**
 * Eval runner for the retrieval-and-generation path.
 *
 * Ingests the eval documents into a collection of their own, puts each case
 * through `query()`, and checks the case's assertions against the answer and
 * the passages that reached the prompt. It embeds, searches and generates
 * against whatever providers the environment configures, so it is a run
 * someone starts deliberately rather than a check CI performs.
 */

import { resolve } from "node:path";
import { type AssertionResult, checkAssertion } from "./assertions.js";
import { coversBothKinds, EmptyCorpusError, loadCases } from "./cases.js";

const here = import.meta.dirname;

interface CaseResult {
  name: string;
  assertions: AssertionResult[];
  error?: string;
}

async function main(): Promise<void> {
  // `loadCases` throws on an empty corpus rather than returning one, so an
  // eval with nothing to run cannot report what an eval that ran everything
  // and passed reports.
  const cases = await loadCases(resolve(here, "cases"));

  if (!coversBothKinds(cases)) {
    console.error(
      "The corpus covers only one kind of case. Golden cases say what the pipeline does " +
        "when asked plainly; adversarial cases are the ones that find out what it does " +
        "when a retrieved passage is trying to steer it.",
    );
    process.exit(1);
  }

  // Config, ingestion and generation reach the provider registry, which builds
  // clients that want credentials. Importing them after the corpus is read
  // means a run with nothing to run says so, instead of failing earlier with a
  // vendor SDK error about a missing key.
  const { loadConfig } = await import("../config.js");
  const { ingestDirectory } = await import("../ingest.js");
  const { query } = await import("../generation.js");

  const base = loadConfig();
  // The eval documents are the fixture these assertions describe, so they go
  // into a collection of their own — a case that asserts what was retrieved
  // means nothing against a store holding somebody else's corpus.
  const config = {
    ...base,
    docsDir: resolve(here, "docs"),
    vectorstore: {
      ...base.vectorstore,
      collectionName: `${base.vectorstore.collectionName}-eval`,
    },
  };

  const stats = await ingestDirectory(config);
  if (stats.chunksStored === 0) {
    console.error(
      `Ingested nothing from ${config.docsDir}. The cases assert what the pipeline retrieves, ` +
        "so an empty store would fail every one of them for the wrong reason.",
    );
    process.exit(1);
  }

  console.log(
    `\nIngested ${stats.filesLoaded} document(s) into "${config.vectorstore.collectionName}".`,
  );
  console.log(`Running ${cases.length} case(s)...\n`);

  const results: CaseResult[] = [];

  for (const testCase of cases) {
    process.stdout.write(`  [${testCase.kind}] ${testCase.name} ... `);

    try {
      const { answer, sources } = await query(testCase.input, config);
      const assertions = testCase.assertions.map((a) => checkAssertion(a, { answer, sources }));
      const passed = assertions.every((a) => a.pass);

      results.push({ name: testCase.name, assertions });
      console.log(passed ? "PASS" : "FAIL");

      for (const assertion of assertions) {
        if (!assertion.pass) console.log(`    FAIL: ${assertion.message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name: testCase.name, assertions: [], error: message });
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

  if (failed.length > 0) process.exit(1);
}

main().catch((err: unknown) => {
  if (err instanceof EmptyCorpusError) {
    console.error(err.message);
    process.exit(1);
  }
  console.error("Eval runner failed:", err);
  process.exit(1);
});
