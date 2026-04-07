// ── Assertions ─────────────────────────────────────────────────────
//
// Registry-based assertion evaluation. Each assertion type registers
// itself with the ASSERTION_REGISTRY map. The runner calls
// evaluateAssertion() to dispatch by type name — no switch statement
// needed. Adding a new assertion type is just adding an entry to the
// registry.
//

/**
 * Result of evaluating a single assertion against an LLM output.
 */
export interface AssertionResult {
  type: string;
  pass: boolean;
  message: string;
}

/**
 * An assertion evaluator takes a configured value and the LLM output
 * string, and returns a result indicating whether the output satisfies
 * the assertion.
 */
type AssertionEvaluator = (value: unknown, output: string) => AssertionResult;

/**
 * Registry mapping assertion type names (as used in YAML suite files)
 * to their evaluator functions.
 */
const ASSERTION_REGISTRY = new Map<string, AssertionEvaluator>();

/**
 * Register an assertion evaluator under the given type name.
 */
export function registerAssertion(
  type: string,
  evaluator: AssertionEvaluator,
): void {
  ASSERTION_REGISTRY.set(type, evaluator);
}

/**
 * Evaluate an assertion by type name, value, and LLM output.
 * Returns a failing result for unknown assertion types.
 */
export function evaluateAssertion(
  type: string,
  value: unknown,
  output: string,
): AssertionResult {
  const evaluator = ASSERTION_REGISTRY.get(type);
  if (!evaluator) {
    return { type, pass: false, message: `Unknown assertion type: ${type}` };
  }
  return evaluator(value, output);
}

// ── Built-in assertion types ───────────────────────────────────────

registerAssertion("contains", (value, output) => {
  const target = String(value);
  const pass = output.includes(target);
  return {
    type: "contains",
    pass,
    message: pass
      ? `Output contains "${target}"`
      : `Output does not contain "${target}"`,
  };
});

registerAssertion("not-contains", (value, output) => {
  const target = String(value);
  const pass = !output.includes(target);
  return {
    type: "not-contains",
    pass,
    message: pass
      ? `Output does not contain "${target}"`
      : `Output unexpectedly contains "${target}"`,
  };
});

registerAssertion("matches-pattern", (value, output) => {
  const pattern = new RegExp(String(value));
  const pass = pattern.test(output);
  return {
    type: "matches-pattern",
    pass,
    message: pass
      ? `Output matches pattern /${String(value)}/`
      : `Output does not match pattern /${String(value)}/`,
  };
});

registerAssertion("max-length", (value, output) => {
  const limit = Number(value);
  const pass = output.length <= limit;
  return {
    type: "max-length",
    pass,
    message: pass
      ? `Output length ${output.length} within limit ${limit}`
      : `Output length ${output.length} exceeds limit ${limit}`,
  };
});
