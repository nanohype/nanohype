import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import "../signatures/index.js";
import { getSignatureProvider } from "../signatures/registry.js";

// ── The other two signature providers ─────────────────────────────
//
// hmac-sha256 has its own suite. These are the two that did not: the
// legacy-compatibility provider and the keyless test double.
//
// A signature provider that always returns true is the one bug here that
// matters, and it is invisible from the passing case alone — so every
// provider is checked on a good signature, a tampered signature, and a
// wrong secret.

describe("hmac-sha1 provider", () => {
  const p = getSignatureProvider("hmac-sha1");

  it("produces the documented HMAC-SHA1 hex digest", () => {
    // Pinned against the construction rather than against itself, so a
    // switch to a different hash or a plain digest fails here.
    expect(p.sign("payload", "secret")).toBe(
      createHmac("sha1", "secret").update("payload").digest("hex"),
    );
  });

  it("verifies a signature it produced", () => {
    expect(p.verify("payload", p.sign("payload", "secret"), "secret")).toBe(true);
  });

  it("rejects a tampered payload", () => {
    expect(p.verify("payload!", p.sign("payload", "secret"), "secret")).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(p.verify("payload", p.sign("payload", "secret"), "other-secret")).toBe(false);
  });

  it("rejects a wrong-length signature without throwing", () => {
    // `timingSafeEqual` throws on unequal lengths, so the length guard is
    // load-bearing: without it a truncated signature crashes the request
    // handler instead of failing verification.
    expect(() => p.verify("payload", "short", "secret")).not.toThrow();
    expect(p.verify("payload", "short", "secret")).toBe(false);
    expect(p.verify("payload", "", "secret")).toBe(false);
  });
});

describe("mock provider", () => {
  const p = getSignatureProvider("mock");

  it("hashes the payload and ignores the secret", () => {
    // Deliberately keyless — that is the whole point of the double, and it
    // is also why it must never be reachable in production. Pinned so the
    // property is a stated fact rather than an accident.
    const digest = createHash("sha256").update("payload").digest("hex");
    expect(p.sign("payload", "any-secret")).toBe(digest);
    expect(p.sign("payload", "different-secret")).toBe(digest);
  });

  it("verifies regardless of the secret supplied", () => {
    const sig = p.sign("payload", "");
    expect(p.verify("payload", sig, "whatever")).toBe(true);
  });

  it("still rejects a tampered payload", () => {
    // Keyless does not mean it accepts anything — a double that passed every
    // signature would make the sender's tests meaningless.
    expect(p.verify("payload!", p.sign("payload", ""), "")).toBe(false);
  });
});

describe("provider identity", () => {
  it("registers each provider under the name it reports", () => {
    // The registry keys on `provider.name`, so a mismatch between the key and
    // the field is how a config asking for one algorithm quietly gets another.
    for (const name of ["hmac-sha1", "hmac-sha256", "mock"]) {
      expect(getSignatureProvider(name).name).toBe(name);
    }
  });

  it("does not sign identically across algorithms", () => {
    // Cheap guard against every provider being wired to the same function.
    const sigs = ["hmac-sha1", "hmac-sha256", "mock"].map((n) =>
      getSignatureProvider(n).sign("payload", "secret"),
    );
    expect(new Set(sigs).size).toBe(3);
  });
});
