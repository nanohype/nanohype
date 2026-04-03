import { describe, it, expect } from "vitest";
import { evaluate, notFoundResult } from "../evaluator.js";
import type { Flag, TargetingContext } from "../types.js";

function makeFlag(overrides: Partial<Flag> = {}): Flag {
  const now = new Date().toISOString();
  return {
    key: "test-flag",
    name: "Test Flag",
    enabled: true,
    type: "boolean",
    variants: [
      { name: "control", value: false },
      { name: "treatment", value: true },
    ],
    rules: [],
    defaultVariant: "control",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("evaluator", () => {
  describe("disabled flags", () => {
    it("returns the default variant when the flag is disabled", () => {
      const flag = makeFlag({ enabled: false });
      const result = evaluate(flag, {});

      expect(result.variant).toBe("control");
      expect(result.value).toBe(false);
      expect(result.reason).toBe("disabled");
      expect(result.enabled).toBe(false);
    });
  });

  describe("default variant", () => {
    it("returns the default variant when no rules match", () => {
      const flag = makeFlag({ rules: [] });
      const result = evaluate(flag, { userId: "user-1" });

      expect(result.variant).toBe("control");
      expect(result.value).toBe(false);
      expect(result.reason).toBe("default");
      expect(result.enabled).toBe(true);
    });
  });

  describe("percentage rollout", () => {
    it("is deterministic for the same userId and flagKey", () => {
      const flag = makeFlag({
        rules: [{ type: "percentage", percentage: 50, variant: "treatment" }],
      });
      const context: TargetingContext = { userId: "user-42" };

      const result1 = evaluate(flag, context);
      const result2 = evaluate(flag, context);

      expect(result1.variant).toBe(result2.variant);
      expect(result1.value).toBe(result2.value);
    });

    it("produces different outcomes for different users", () => {
      const flag = makeFlag({
        rules: [{ type: "percentage", percentage: 50, variant: "treatment" }],
      });

      // With enough users, we should see both variants
      const variants = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = evaluate(flag, { userId: `user-${i}` });
        variants.add(result.variant);
      }

      expect(variants.has("treatment")).toBe(true);
      expect(variants.has("control")).toBe(true);
    });

    it("100% rollout always returns the treatment variant", () => {
      const flag = makeFlag({
        rules: [{ type: "percentage", percentage: 100, variant: "treatment" }],
      });

      for (let i = 0; i < 20; i++) {
        const result = evaluate(flag, { userId: `user-${i}` });
        expect(result.variant).toBe("treatment");
        expect(result.reason).toBe("rule_match");
      }
    });

    it("0% rollout always returns the default variant", () => {
      const flag = makeFlag({
        rules: [{ type: "percentage", percentage: 0, variant: "treatment" }],
      });

      for (let i = 0; i < 20; i++) {
        const result = evaluate(flag, { userId: `user-${i}` });
        expect(result.variant).toBe("control");
        expect(result.reason).toBe("default");
      }
    });

    it("skips percentage rule when userId is not provided", () => {
      const flag = makeFlag({
        rules: [{ type: "percentage", percentage: 100, variant: "treatment" }],
      });

      const result = evaluate(flag, {});
      expect(result.variant).toBe("control");
      expect(result.reason).toBe("default");
    });
  });

  describe("allowlist", () => {
    it("matches users in the allowlist", () => {
      const flag = makeFlag({
        rules: [
          { type: "allowlist", userIds: ["user-1", "user-2"], variant: "treatment" },
        ],
      });

      const result = evaluate(flag, { userId: "user-1" });
      expect(result.variant).toBe("treatment");
      expect(result.reason).toBe("rule_match");
      expect(result.ruleIndex).toBe(0);
    });

    it("does not match users outside the allowlist", () => {
      const flag = makeFlag({
        rules: [
          { type: "allowlist", userIds: ["user-1", "user-2"], variant: "treatment" },
        ],
      });

      const result = evaluate(flag, { userId: "user-99" });
      expect(result.variant).toBe("control");
      expect(result.reason).toBe("default");
    });
  });

  describe("property matching", () => {
    it("matches eq operator", () => {
      const flag = makeFlag({
        rules: [
          {
            type: "property",
            property: "plan",
            operator: "eq",
            compareValue: "enterprise",
            variant: "treatment",
          },
        ],
      });

      const result = evaluate(flag, { properties: { plan: "enterprise" } });
      expect(result.variant).toBe("treatment");
      expect(result.reason).toBe("rule_match");
    });

    it("matches neq operator", () => {
      const flag = makeFlag({
        rules: [
          {
            type: "property",
            property: "plan",
            operator: "neq",
            compareValue: "free",
            variant: "treatment",
          },
        ],
      });

      const result = evaluate(flag, { properties: { plan: "enterprise" } });
      expect(result.variant).toBe("treatment");
    });

    it("matches in operator", () => {
      const flag = makeFlag({
        rules: [
          {
            type: "property",
            property: "region",
            operator: "in",
            compareValue: ["us-east", "us-west"],
            variant: "treatment",
          },
        ],
      });

      const result = evaluate(flag, { properties: { region: "us-east" } });
      expect(result.variant).toBe("treatment");
    });

    it("matches gt operator for numeric properties", () => {
      const flag = makeFlag({
        rules: [
          {
            type: "property",
            property: "age",
            operator: "gt",
            compareValue: 18,
            variant: "treatment",
          },
        ],
      });

      const result = evaluate(flag, { properties: { age: 25 } });
      expect(result.variant).toBe("treatment");

      const result2 = evaluate(flag, { properties: { age: 15 } });
      expect(result2.variant).toBe("control");
    });

    it("returns default when property is missing from context", () => {
      const flag = makeFlag({
        rules: [
          {
            type: "property",
            property: "plan",
            operator: "eq",
            compareValue: "enterprise",
            variant: "treatment",
          },
        ],
      });

      const result = evaluate(flag, { properties: {} });
      expect(result.variant).toBe("control");
      expect(result.reason).toBe("default");
    });
  });

  describe("rule priority", () => {
    it("first matching rule wins", () => {
      const flag = makeFlag({
        rules: [
          { type: "allowlist", userIds: ["user-1"], variant: "treatment" },
          { type: "percentage", percentage: 100, variant: "control" },
        ],
      });

      const result = evaluate(flag, { userId: "user-1" });
      expect(result.variant).toBe("treatment");
      expect(result.ruleIndex).toBe(0);
    });
  });

  describe("notFoundResult", () => {
    it("returns a not_found result", () => {
      const result = notFoundResult("missing-flag");
      expect(result.flagKey).toBe("missing-flag");
      expect(result.reason).toBe("not_found");
      expect(result.enabled).toBe(false);
    });
  });
});
