import { describe, it, expect, vi, afterEach } from "vitest";
import { selectUpstream, isCanaryConfig } from "../traffic/canary.js";
import type { CanaryConfig } from "../types.js";

// ── Canary Tests ────────────────────────────────────────────────────
//
// Validates percentage-based traffic splitting accuracy over many
// requests, edge cases (0%, 100%), and type guard behavior.
//

describe("selectUpstream", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns primary when canaryPercent is 0", () => {
    const config: CanaryConfig = {
      primary: "http://v1:3001",
      canary: "http://v2:3001",
      canaryPercent: 0,
    };

    for (let i = 0; i < 100; i++) {
      expect(selectUpstream(config)).toBe("http://v1:3001");
    }
  });

  it("returns canary when canaryPercent is 100", () => {
    const config: CanaryConfig = {
      primary: "http://v1:3001",
      canary: "http://v2:3001",
      canaryPercent: 100,
    };

    for (let i = 0; i < 100; i++) {
      expect(selectUpstream(config)).toBe("http://v2:3001");
    }
  });

  it("splits traffic approximately according to canaryPercent", () => {
    const config: CanaryConfig = {
      primary: "http://v1:3001",
      canary: "http://v2:3001",
      canaryPercent: 30,
    };

    const iterations = 10_000;
    let canaryCount = 0;

    for (let i = 0; i < iterations; i++) {
      if (selectUpstream(config) === "http://v2:3001") {
        canaryCount++;
      }
    }

    const canaryPercent = (canaryCount / iterations) * 100;

    // Allow 5% tolerance for randomness
    expect(canaryPercent).toBeGreaterThan(25);
    expect(canaryPercent).toBeLessThan(35);
  });

  it("routes to canary when random value is below threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05); // 5 < 10

    const config: CanaryConfig = {
      primary: "http://v1:3001",
      canary: "http://v2:3001",
      canaryPercent: 10,
    };

    expect(selectUpstream(config)).toBe("http://v2:3001");
  });

  it("routes to primary when random value is above threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 50 > 10

    const config: CanaryConfig = {
      primary: "http://v1:3001",
      canary: "http://v2:3001",
      canaryPercent: 10,
    };

    expect(selectUpstream(config)).toBe("http://v1:3001");
  });
});

describe("isCanaryConfig", () => {
  it("returns true for a valid canary config object", () => {
    expect(
      isCanaryConfig({
        primary: "http://v1:3001",
        canary: "http://v2:3001",
        canaryPercent: 10,
      }),
    ).toBe(true);
  });

  it("returns false for a plain string", () => {
    expect(isCanaryConfig("http://v1:3001")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCanaryConfig(null)).toBe(false);
  });

  it("returns false for an incomplete object", () => {
    expect(isCanaryConfig({ primary: "http://v1:3001" })).toBe(false);
  });
});
