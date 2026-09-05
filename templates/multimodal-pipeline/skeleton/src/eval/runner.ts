/**
 * Eval runner.
 *
 * Unit tests cover the deterministic half of the pipeline: MIME routing,
 * processors, registries, the formatter's fallback. None of them says anything
 * about the model, which is the component whose output a consumer actually
 * stores. This runner drives the analysis stage over a corpus of extracted
 * content and checks what comes back.
 *
 * It calls a live provider, so it is a command a consumer runs against real
 * credentials rather than something that runs unattended on every commit.
 */

import { extname, resolve } from "node:path";
import { lookup } from "mime-types";
import { audioAnalysisSchema, imageAnalysisSchema, videoAnalysisSchema } from "../output/types.js";
import type { Modality, ProcessedInput } from "../processors/types.js";
import type { CaseAssertion } from "./cases.js";
import { coversBothKinds, EmptyCorpusError, loadCases, splitInput } from "./cases.js";

interface AssertionResult {
  pass: boolean;
  message: string;
}

interface CaseResult {
  name: string;
  assertions: AssertionResult[];
  error?: string;
}

const SCHEMAS = {
  image: imageAnalysisSchema,
  audio: audioAnalysisSchema,
  video: videoAnalysisSchema,
};

/** The model is asked for bare JSON; some of it arrives fenced anyway. */
function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw;
}

/**
 * Whether the raw output validates against the schema for its modality.
 *
 * Checked against the raw text rather than the formatted result, because the
 * formatter wraps unparseable output in a minimal valid structure — so a
 * result that satisfies the schema does not on its own mean the model produced
 * anything a consumer can read fields out of.
 */
function isStructured(raw: string, modality: Modality): boolean {
  try {
    return SCHEMAS[modality].safeParse(JSON.parse(stripFences(raw))).success;
  } catch {
    return false;
  }
}

/** One field of the parsed analysis, as text an assertion can be run over. */
function fieldText(analysis: unknown, field: string): string {
  const value = (analysis as Record<string, unknown>)[field];
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function check(
  assertion: CaseAssertion,
  raw: string,
  analysis: unknown,
  modality: Modality,
) {
  const because = assertion.why ? ` — ${assertion.why}` : "";

  switch (assertion.type) {
    case "contains": {
      const wanted = String(assertion.value);
      return {
        pass: raw.includes(wanted),
        message: `contains "${wanted}"${because}`,
      };
    }
    case "not_contains": {
      const unwanted = String(assertion.value);
      return {
        pass: !raw.includes(unwanted),
        message: `does not contain "${unwanted}"${because}`,
      };
    }
    case "matches_pattern": {
      const pattern = new RegExp(String(assertion.value), "i");
      return { pass: pattern.test(raw), message: `matches ${pattern}${because}` };
    }
    case "modality": {
      const wanted = String(assertion.value);
      return {
        pass: modality === wanted,
        message: `routed to ${wanted}, not ${modality}${because}`,
      };
    }
    case "structured_output": {
      const wanted = assertion.value !== false;
      const got = isStructured(raw, modality);
      return {
        pass: got === wanted,
        message: `output ${wanted ? "validates" : "does not validate"} against the ${modality} schema${because}`,
      };
    }
    case "field_matches": {
      const { field, pattern } = assertion.value as { field?: string; pattern?: string };
      if (!field || !pattern) {
        return { pass: false, message: "field_matches needs a field and a pattern" };
      }
      const text = fieldText(analysis, field);
      return {
        pass: new RegExp(pattern, "i").test(text),
        message: `${field} matches /${pattern}/i, was ${JSON.stringify(text)}${because}`,
      };
    }
    default:
      // An unrecognised type is a case that checks nothing, which is the shape
      // this suite exists to keep out.
      return {
        pass: false,
        message: `unknown assertion type "${String(assertion.type)}"`,
      };
  }
}

async function main(): Promise<void> {
  const casesDir = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "cases");

  // `loadCases` throws on an empty corpus rather than returning one, so an
  // eval that has nothing to run cannot report the same thing as an eval that
  // ran everything and passed.
  const cases = await loadCases(casesDir);

  if (!coversBothKinds(cases)) {
    console.error(
      "The corpus covers only one kind of case. Golden cases say what the stage does with " +
        "media a consumer meant to send; adversarial cases are the ones that find out what " +
        "it does with the rest.",
    );
    process.exit(1);
  }

  // The corpus is read before the pipeline is imported and before a provider
  // client is built. Building one needs a key, so a run with nothing to run
  // reports an empty corpus rather than a missing credential.
  const { loadConfig } = await import("../config.js");
  const { analyzeProcessed, detectModality } = await import("../pipeline.js");

  const config = loadConfig();
  const results: CaseResult[] = [];

  for (const evalCase of cases) {
    process.stdout.write(`  [${evalCase.kind}] ${evalCase.name} ... `);

    try {
      const { source, content } = splitInput(evalCase.input);
      const mimeType = lookup(extname(source)) || "application/octet-stream";
      const modality = detectModality(mimeType);

      // A case carries what extraction produced, not the media itself, so the
      // stage runs without a transcription or frame-extraction round trip.
      const processed: ProcessedInput = {
        modality,
        mimeType,
        source,
        text: content,
        metadata: { origin: "eval" },
      };

      const result = await analyzeProcessed(processed, config);
      const assertions = evalCase.assertions.map((a) =>
        check(a, result.raw, result.analysis, result.modality),
      );

      results.push({ name: evalCase.name, assertions });
      const passed = assertions.every((a) => a.pass);
      console.log(passed ? "PASS" : "FAIL");
      if (!passed) {
        for (const a of assertions.filter((x) => !x.pass)) console.log(`    FAIL: ${a.message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name: evalCase.name, assertions: [], error: message });
      console.log("ERROR");
      console.log(`    ${message}`);
    }
  }

  const failed = results.filter((r) => r.error || r.assertions.some((a) => !a.pass));
  const total = results.reduce((sum, r) => sum + r.assertions.length, 0);
  const passed = results.reduce((sum, r) => sum + r.assertions.filter((a) => a.pass).length, 0);

  console.log("\n--- Summary ---");
  console.log(`Cases: ${results.length} run, ${results.length - failed.length} passed`);
  console.log(`Assertions: ${total} checked, ${passed} passed`);

  if (failed.length > 0) process.exit(1);
}

// Guarded so importing this module for `check` does not start an eval run. A
// module that executes on import cannot be tested without running what it does.
const invokedDirectly = process.argv[1]?.endsWith("runner.ts");
if (invokedDirectly) {
  main().catch((err: unknown) => {
    if (err instanceof EmptyCorpusError) {
      console.error(err.message);
      process.exit(1);
    }
    console.error("Eval runner failed:", err);
    process.exit(1);
  });
}
