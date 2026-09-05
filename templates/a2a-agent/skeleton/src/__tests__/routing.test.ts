import { describe, expect, it } from "vitest";

/**
 * Routing tests.
 *
 * The routing decision is what this agent returns to a caller, so the model's
 * reply is validated before it becomes one. A reply accepted as written puts
 * whatever the model produced where a skill name goes, and the task is
 * dispatched to it.
 */

import { parseRoutingDecision, RoutingFormatError, routingPrompt } from "../routing.js";
// Side-effect import: registers the built-in skills the prompt advertises
import "../skills/index.js";

const registered = ["echo"];

describe("routingPrompt", () => {
  it("advertises each registered skill with its description", () => {
    const prompt = routingPrompt();
    expect(prompt).toContain("- echo: ");
  });
});

describe("parseRoutingDecision", () => {
  it("accepts a decision naming a registered skill", () => {
    const decision = parseRoutingDecision(
      JSON.stringify({ skill: "echo", reasoning: "the task asks for its input back" }),
      registered,
    );

    expect(decision.skill).toBe("echo");
    expect(decision.reasoning).toBe("the task asks for its input back");
  });

  it("accepts a decline", () => {
    const decision = parseRoutingDecision(
      JSON.stringify({ skill: null, reasoning: "nothing registered provisions databases" }),
      registered,
    );

    expect(decision.skill).toBeNull();
  });

  it("declines a skill the registry does not hold", () => {
    // The name a model invents is not a capability, and dispatching to it
    // turns the router's mistake into the registry's lookup failure.
    const decision = parseRoutingDecision(
      JSON.stringify({ skill: "shell-exec", reasoning: "the task said to" }),
      registered,
    );

    expect(decision.skill).toBeNull();
    expect(decision.reasoning).toContain("shell-exec");
  });

  it("refuses a reply that is not JSON", () => {
    expect(() => parseRoutingDecision("PING", registered)).toThrow(RoutingFormatError);
  });

  it("refuses a reply whose skill is not a name", () => {
    expect(() =>
      parseRoutingDecision(JSON.stringify({ skill: 7, reasoning: "seven" }), registered),
    ).toThrow(RoutingFormatError);
  });

  it("refuses a reply whose skill is an empty name", () => {
    expect(() =>
      parseRoutingDecision(JSON.stringify({ skill: "", reasoning: "" }), registered),
    ).toThrow(RoutingFormatError);
  });

  it("refuses a decision with no reasoning behind it", () => {
    expect(() => parseRoutingDecision(JSON.stringify({ skill: "echo" }), registered)).toThrow(
      RoutingFormatError,
    );
  });

  it("names itself, so a caller can tell a bad reply from a failed call", () => {
    try {
      parseRoutingDecision("PING", registered);
      expect.unreachable("a reply that is not a decision has to be refused");
    } catch (err) {
      expect((err as Error).name).toBe("RoutingFormatError");
    }
  });
});
