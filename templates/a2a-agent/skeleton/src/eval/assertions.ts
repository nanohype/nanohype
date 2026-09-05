import type { RoutingDecision } from "../routing.js";

/**
 * Assertion helpers for routing evaluation. Each function returns a
 * { pass, message } result instead of throwing, so the eval runner
 * can collect all results and print a summary.
 *
 * Every helper reads a {@link RoutingOutcome} rather than a decision, because
 * a router that failed on the model's reply is an outcome the corpus has cases
 * about — the assertion decides whether that outcome is the one required.
 */

export interface AssertionResult {
  pass: boolean;
  message: string;
}

/** Why routing produced no decision. */
export interface RoutingFailure {
  /** `format` when the reply was not a routing decision; anything else is `unexpected`. */
  kind: "format" | "unexpected";
  message: string;
}

/** What one routing call produced: a decision, or the reason there is none. */
export interface RoutingOutcome {
  decision: RoutingDecision | null;
  failure?: RoutingFailure;
}

function describe(outcome: RoutingOutcome): string {
  if (outcome.decision) {
    return `routed to ${outcome.decision.skill ?? "(none)"}`;
  }
  return `no decision — ${outcome.failure?.kind ?? "unexpected"}: ${outcome.failure?.message ?? "unknown"}`;
}

/** Assert that the task reached a named skill. */
export function routesTo(outcome: RoutingOutcome, skill: string): AssertionResult {
  const pass = outcome.decision?.skill === skill;
  return {
    pass,
    message: pass
      ? `Routed to "${skill}"`
      : `Expected routing to "${skill}", got ${describe(outcome)}`,
  };
}

/** Assert that the task did not reach a named skill. */
export function notRoutesTo(outcome: RoutingOutcome, skill: string): AssertionResult {
  const pass = outcome.decision?.skill !== skill;
  return {
    pass,
    message: pass ? `Did not route to "${skill}"` : `Routed to "${skill}"`,
  };
}

/** Assert that the router declined: a decision naming no skill. */
export function declines(outcome: RoutingOutcome): AssertionResult {
  const pass = outcome.decision !== null && outcome.decision.skill === null;
  return {
    pass,
    message: pass ? "Declined the task" : `Expected a decline, got ${describe(outcome)}`,
  };
}

/**
 * Assert that the rationale behind the decision matches a pattern.
 *
 * An outcome with no decision carries no rationale, and both rationale
 * assertions fail there rather than reading an empty string — a check with
 * nothing to read against passes for every input, which is the same hole an
 * empty corpus opens one level up.
 */
export function reasoningMatches(outcome: RoutingOutcome, pattern: RegExp): AssertionResult {
  if (outcome.decision === null) {
    return { pass: false, message: `No rationale to match ${pattern}: ${describe(outcome)}` };
  }

  const { reasoning } = outcome.decision;
  const pass = pattern.test(reasoning);
  return {
    pass,
    message: pass
      ? `Reasoning matches ${pattern}`
      : `Expected reasoning to match ${pattern}, got "${reasoning}"`,
  };
}

/**
 * Assert that a string is absent from the rationale. The rationale is logged
 * with every decision, so what lands in it travels wherever the log does.
 */
export function reasoningNotContains(outcome: RoutingOutcome, substring: string): AssertionResult {
  if (outcome.decision === null) {
    return {
      pass: false,
      message: `No rationale to check for "${substring}": ${describe(outcome)}`,
    };
  }

  const pass = !outcome.decision.reasoning.toLowerCase().includes(substring.toLowerCase());
  return {
    pass,
    message: pass ? `Reasoning omits "${substring}"` : `Reasoning contains "${substring}"`,
  };
}

/**
 * Assert that the outcome is one the agent can act on: a decline, a skill the
 * registry holds, or a reply refused as not a decision. A name outside the
 * registry is a misroute reported as a decision, and fails here.
 */
export function routeIsExecutable(outcome: RoutingOutcome, registered: string[]): AssertionResult {
  if (outcome.decision === null) {
    const pass = outcome.failure?.kind === "format";
    return {
      pass,
      message: pass
        ? "Refused a reply that was not a routing decision"
        : `Routing failed for another reason: ${outcome.failure?.message ?? "unknown"}`,
    };
  }

  const { skill } = outcome.decision;
  const pass = skill === null || registered.includes(skill);
  return {
    pass,
    message: pass
      ? `Decision is executable: ${skill ?? "(none)"}`
      : `Decision names "${skill}", which the registry does not hold: [${registered.join(", ")}]`,
  };
}
