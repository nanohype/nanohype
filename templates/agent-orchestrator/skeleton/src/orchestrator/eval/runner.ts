// ── Eval Runner ─────────────────────────────────────────────────────
//
// Sends each case in the corpus through the orchestrator and checks the
// plan that comes back. This is a live run against whichever provider is
// configured, so it costs tokens and needs a key — a command to run
// on purpose. The unit suite covers the corpus loader and the plan checks
// without reaching a provider.
//
//   npm run eval                     # the configured provider
//   EVAL_PROVIDER=mock npm run eval  # exercises the runner without a key
//
// The mock provider answers with a fixed plan, so a green run under it says
// the runner works rather than that the orchestrator does.
//

import { resolve } from "node:path";
import type { AssertionResult, PlanView } from "./assertions.js";
import { checkAssertion } from "./assertions.js";
import { coversBothKinds, EmptyCorpusError, type EvalCase, loadCases } from "./cases.js";

/**
 * The subtask cap the eval runs under. A case asserting `max_subtasks`
 * is asserting against this number, so a goal that argues for hundreds of
 * steps is measured against the same limit production runs under.
 */
const MAX_SUBTASKS = 10;

interface CaseOutcome {
  name: string;
  kind: EvalCase["kind"];
  assertions: AssertionResult[];
  error?: string;
}

/** Task ids appear in logs and metrics, so derive one from the case name. */
function taskId(name: string): string {
  return `eval-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

async function main(): Promise<void> {
  const casesDir = resolve(import.meta.dirname, "cases");

  // `loadCases` throws on an empty corpus rather than returning one, and it
  // runs before anything that reaches a provider: an SDK client built first
  // would fail on credentials, which reads as a broken key rather than as an
  // eval with nothing to run.
  const corpus = await loadCases(casesDir);

  if (!coversBothKinds(corpus)) {
    console.error(
      "The corpus covers only one kind of case. Golden cases say what the orchestrator does " +
        "with a goal that means what it says; adversarial cases are the ones that find out " +
        "what it does with a goal that does not.",
    );
    process.exit(1);
  }

  const { createOrchestrator } = await import("../index.js");

  const providerName = process.env.EVAL_PROVIDER ?? "__LLM_PROVIDER__";
  const orchestrator = createOrchestrator({ providerName, maxSubtasks: MAX_SUBTASKS });

  console.log(`Running ${corpus.length} case(s) against provider "${providerName}"...\n`);

  const outcomes: CaseOutcome[] = [];

  for (const evalCase of corpus) {
    process.stdout.write(`  [${evalCase.kind}] ${evalCase.name} ... `);

    try {
      const result = await orchestrator.execute({
        id: taskId(evalCase.name),
        description: evalCase.input,
      });

      const plan: PlanView = { subtasks: result.subtasks, reasoning: result.reasoning };
      const assertions = evalCase.assertions.map((a) => checkAssertion(plan, a));
      const passed = assertions.every((a) => a.pass);

      outcomes.push({ name: evalCase.name, kind: evalCase.kind, assertions });
      console.log(passed ? "PASS" : "FAIL");

      for (const assertion of assertions) {
        if (!assertion.pass) console.log(`    FAIL: ${assertion.message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push({ name: evalCase.name, kind: evalCase.kind, assertions: [], error: message });
      console.log("ERROR");
      console.log(`    ${message}`);
    }
  }

  const totalAssertions = outcomes.reduce((sum, o) => sum + o.assertions.length, 0);
  const passedAssertions = outcomes.reduce(
    (sum, o) => sum + o.assertions.filter((a) => a.pass).length,
    0,
  );
  const failed = outcomes.filter((o) => o.error || o.assertions.some((a) => !a.pass));

  console.log("\n--- Summary ---");
  console.log(
    `Cases: ${outcomes.length} total, ${outcomes.length - failed.length} passed, ${failed.length} failed`,
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
