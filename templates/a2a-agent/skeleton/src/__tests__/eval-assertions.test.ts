import { describe, expect, it } from "vitest";

/**
 * Eval assertion helpers.
 *
 * These decide whether a case passed, so a helper that returns true for
 * everything is an eval suite that reports a pass for everything.
 */

import {
  declines,
  notRoutesTo,
  type RoutingOutcome,
  reasoningMatches,
  reasoningNotContains,
  routeIsExecutable,
  routesTo,
} from "../eval/assertions.js";

const routed = (skill: string | null, reasoning = "because"): RoutingOutcome => ({
  decision: { skill, reasoning },
});

const failed = (kind: "format" | "unexpected"): RoutingOutcome => ({
  decision: null,
  failure: { kind, message: "no decision" },
});

describe("routesTo", () => {
  it("passes when the task reached the named skill", () => {
    expect(routesTo(routed("echo"), "echo").pass).toBe(true);
  });

  it("fails when the task reached a different skill", () => {
    expect(routesTo(routed("summarise"), "echo").pass).toBe(false);
  });

  it("fails when there is no decision at all", () => {
    expect(routesTo(failed("format"), "echo").pass).toBe(false);
  });
});

describe("notRoutesTo", () => {
  it("fails when the task reached the named skill", () => {
    expect(notRoutesTo(routed("shell-exec"), "shell-exec").pass).toBe(false);
  });

  it("passes when the router declined", () => {
    expect(notRoutesTo(routed(null), "shell-exec").pass).toBe(true);
  });
});

describe("declines", () => {
  it("passes on a decision naming no skill", () => {
    expect(declines(routed(null)).pass).toBe(true);
  });

  it("fails on a route", () => {
    expect(declines(routed("echo")).pass).toBe(false);
  });

  it("fails when routing produced no decision, which is not a decline", () => {
    expect(declines(failed("format")).pass).toBe(false);
  });
});

describe("reasoningMatches", () => {
  it("passes when the rationale matches", () => {
    expect(reasoningMatches(routed("echo", "the echo skill returns input"), /[Ee]cho/).pass).toBe(
      true,
    );
  });

  it("fails when there is no rationale to read", () => {
    expect(reasoningMatches(failed("unexpected"), /./).pass).toBe(false);
  });
});

describe("reasoningNotContains", () => {
  it("fails on a match regardless of case", () => {
    expect(reasoningNotContains(routed("echo", "key SK-ANT-123"), "sk-").pass).toBe(false);
  });

  it("passes when the string is absent", () => {
    expect(reasoningNotContains(routed("echo", "returns input"), "sk-").pass).toBe(true);
  });

  it("fails when there is no rationale, rather than passing on an empty one", () => {
    expect(reasoningNotContains(failed("format"), "sk-").pass).toBe(false);
  });
});

describe("routeIsExecutable", () => {
  it("passes for a skill the registry holds", () => {
    expect(routeIsExecutable(routed("echo"), ["echo"]).pass).toBe(true);
  });

  it("passes for a decline", () => {
    expect(routeIsExecutable(routed(null), ["echo"]).pass).toBe(true);
  });

  it("fails for a name the registry does not hold", () => {
    expect(routeIsExecutable(routed("shell-exec"), ["echo"]).pass).toBe(false);
  });

  it("passes when a reply that was not a decision was refused", () => {
    expect(routeIsExecutable(failed("format"), ["echo"]).pass).toBe(true);
  });

  it("fails when routing broke for some other reason", () => {
    expect(routeIsExecutable(failed("unexpected"), ["echo"]).pass).toBe(false);
  });
});
