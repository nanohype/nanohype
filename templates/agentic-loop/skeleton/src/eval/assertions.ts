/**
 * Assertion helpers for agent evaluation. Each function returns a
 * { pass, message } result instead of throwing, so the eval runner
 * can collect all results and print a summary.
 */

export interface AssertionResult {
  pass: boolean;
  message: string;
}

/** Assert that the response contains a substring. */
export function contains(response: string, substring: string): AssertionResult {
  const pass = response.includes(substring);
  return {
    pass,
    message: pass
      ? `Contains "${substring}"`
      : `Expected response to contain "${substring}", but it was not found`,
  };
}

/** Assert that the response matches a regular expression. */
export function matchesPattern(response: string, pattern: RegExp): AssertionResult {
  const pass = pattern.test(response);
  return {
    pass,
    message: pass
      ? `Matches pattern ${pattern}`
      : `Expected response to match ${pattern}, but it did not`,
  };
}

/**
 * Assert that a specific tool was called during the agent run.
 * Checks the tool call log (an array of tool names that were invoked).
 */
export function toolWasCalled(
  toolCallLog: string[],
  toolName: string,
): AssertionResult {
  const pass = toolCallLog.includes(toolName);
  return {
    pass,
    message: pass
      ? `Tool "${toolName}" was called`
      : `Expected tool "${toolName}" to be called, but it was not. Called: [${toolCallLog.join(", ")}]`,
  };
}

/**
 * Assert that a specific tool was NOT called during the agent run.
 */
export function toolWasNotCalled(
  toolCallLog: string[],
  toolName: string,
): AssertionResult {
  const pass = !toolCallLog.includes(toolName);
  return {
    pass,
    message: pass
      ? `Tool "${toolName}" was not called (as expected)`
      : `Expected tool "${toolName}" NOT to be called, but it was`,
  };
}

/**
 * Assert that the response satisfies a custom predicate function.
 * The description parameter is used in the result message.
 */
export function satisfies(
  response: string,
  description: string,
  predicate: (response: string) => boolean,
): AssertionResult {
  const pass = predicate(response);
  return {
    pass,
    message: pass
      ? `Satisfies: ${description}`
      : `Failed: ${description}`,
  };
}

/**
 * Assert that the agent completed within a given number of iterations.
 */
export function completedWithinIterations(
  actualIterations: number,
  maxExpected: number,
): AssertionResult {
  const pass = actualIterations <= maxExpected;
  return {
    pass,
    message: pass
      ? `Completed in ${actualIterations} iteration(s) (limit: ${maxExpected})`
      : `Took ${actualIterations} iterations, expected at most ${maxExpected}`,
  };
}
