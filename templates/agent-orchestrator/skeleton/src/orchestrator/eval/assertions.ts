// ── Eval Assertions ─────────────────────────────────────────────────
//
// Each check reads the plan the orchestrator produced — the subtasks it
// returned and the planner's reasoning — and answers with
// { pass, message } instead of throwing, so the runner can report every
// assertion in a case rather than the first one that failed.
//
// The plan is the surface's product, so the checks are structural: how
// many steps, whether the order is workable, and what the plan does or
// does not say. A check a human has to adjudicate cannot gate anything.
//

import type { SubTask } from "../types.js";
import type { CaseAssertion } from "./cases.js";

export interface AssertionResult {
  pass: boolean;
  message: string;
}

/** What a check sees: the decomposition, in the order it will execute. */
export interface PlanView {
  subtasks: SubTask[];
  reasoning: string;
}

/** Everything the plan says, flattened for substring checks. */
export function planText(plan: PlanView): string {
  return [
    plan.reasoning,
    ...plan.subtasks.flatMap((s) => [s.id, s.description, s.assignedAgent, s.requiredCapability]),
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n");
}

/**
 * Every declared dependency names a subtask in the plan, and that
 * subtask comes first. A plan whose edges point at steps that are not
 * there executes as a stump: the orchestrator skips each dependent for a
 * dependency that never ran.
 */
export function dependenciesResolvable(plan: PlanView): { ok: boolean; detail: string } {
  const seen = new Set<string>();
  for (const subtask of plan.subtasks) {
    for (const dep of subtask.dependsOn) {
      if (!seen.has(dep)) {
        const known = plan.subtasks.some((s) => s.id === dep);
        return {
          ok: false,
          detail: known
            ? `"${subtask.id}" depends on "${dep}", which comes later`
            : `"${subtask.id}" depends on "${dep}", which is not in the plan`,
        };
      }
    }
    seen.add(subtask.id);
  }
  return { ok: true, detail: "every dependency names an earlier subtask" };
}

/** At least one subtask waits on another, so the plan is ordered rather than a list. */
export function hasDependencyEdge(plan: PlanView): boolean {
  return plan.subtasks.some((s) => s.dependsOn.length > 0);
}

function result(pass: boolean, message: string, why?: string): AssertionResult {
  return { pass, message: pass || !why ? message : `${message} — ${why}` };
}

/**
 * Apply one assertion to a plan.
 *
 * Boolean-valued assertions read `false` as "must not hold", so a case can
 * state either direction with the same vocabulary.
 */
export function checkAssertion(plan: PlanView, assertion: CaseAssertion): AssertionResult {
  const count = plan.subtasks.length;

  switch (assertion.type) {
    case "min_subtasks": {
      const min = Number(assertion.value);
      return result(
        count >= min,
        `Plan has ${count} subtask(s), expected at least ${min}`,
        assertion.why,
      );
    }

    case "max_subtasks": {
      const max = Number(assertion.value);
      return result(
        count <= max,
        `Plan has ${count} subtask(s), expected at most ${max}`,
        assertion.why,
      );
    }

    case "has_dependency_edge": {
      const expected = assertion.value !== false;
      const actual = hasDependencyEdge(plan);
      return result(
        actual === expected,
        actual
          ? "Plan declares a dependency between subtasks"
          : "No subtask depends on another; the plan is a flat list",
        assertion.why,
      );
    }

    case "dependencies_resolvable": {
      const expected = assertion.value !== false;
      const { ok, detail } = dependenciesResolvable(plan);
      return result(ok === expected, detail, assertion.why);
    }

    case "plan_contains": {
      const needle = String(assertion.value);
      const found = planText(plan).toLowerCase().includes(needle.toLowerCase());
      return result(
        found,
        found ? `Plan mentions "${needle}"` : `Plan does not mention "${needle}"`,
        assertion.why,
      );
    }

    case "plan_not_contains": {
      const needle = String(assertion.value);
      const found = planText(plan).toLowerCase().includes(needle.toLowerCase());
      return result(
        !found,
        found ? `Plan mentions "${needle}"` : `Plan does not mention "${needle}"`,
        assertion.why,
      );
    }

    default:
      // A case file is JSON and JSON does not honour a union, so a type outside
      // the declared set arrives here at run time. Without this arm it produces
      // no result, and `every` over an empty list is true — the case passes
      // having checked nothing.
      return {
        pass: false,
        message: `Unknown assertion type "${(assertion as { type: string }).type}" — nothing checks it`,
      };
  }
}
