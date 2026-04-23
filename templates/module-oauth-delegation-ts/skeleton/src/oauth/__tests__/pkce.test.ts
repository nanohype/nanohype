import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { codeChallenge, generateCodeVerifier } from "../pkce.js";

describe("pkce", () => {
  it("generates a 43-character base64url verifier", () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("produces distinct verifiers per call", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });

  it("computes S256 challenge as base64url(sha256(verifier))", () => {
    const v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = createHash("sha256")
      .update(v)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(codeChallenge(v)).toBe(expected);
  });
});
