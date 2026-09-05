import { describe, expect, it } from "vitest";
import { auditAppendTotal, auditQueryTotal } from "../metrics.js";

describe("audit counters", () => {
  it("record without an OTel SDK wired in", () => {
    expect(() => auditAppendTotal.add(1, { provider: "memory", result: "ok" })).not.toThrow();
    expect(() => auditQueryTotal.add(1, { provider: "memory" })).not.toThrow();
  });
});
