import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { StateExpiredError, StateMissingError, StateTamperedError } from "../errors.js";
import {
  assertStateFresh,
  buildStateCookie,
  clearStateCookie,
  generateNonce,
  readStateCookie,
  readStatePayloadUnverified,
  signState,
  STATE_COOKIE_NAME,
  verifyState,
  type StatePayload,
} from "../state.js";

const SECRET = "test-signing-secret-very-long-and-random";

function payload(overrides: Partial<StatePayload> = {}): StatePayload {
  return {
    nonce: "nonce-1",
    userId: "user-1",
    provider: "notion",
    returnTo: "/done",
    createdAt: 1_000_000,
    codeVerifier: "v".repeat(43),
    ...overrides,
  };
}

describe("state cookie", () => {
  it("round-trips a signed payload", () => {
    const signed = signState(payload(), SECRET);
    const parsed = verifyState(signed, SECRET);
    expect(parsed.nonce).toBe("nonce-1");
    expect(parsed.userId).toBe("user-1");
  });

  it("rejects a tampered body", () => {
    const signed = signState(payload(), SECRET);
    const [body, sig] = signed.split(".");
    // Mutate the body but keep the old signature.
    const tampered = `${body}XX.${sig}`;
    expect(() => verifyState(tampered, SECRET)).toThrow(StateTamperedError);
  });

  it("rejects a wrong signing key", () => {
    const signed = signState(payload(), SECRET);
    expect(() => verifyState(signed, "different-secret")).toThrow(StateTamperedError);
  });

  it("rejects a missing signature", () => {
    expect(() => verifyState("no-dot", SECRET)).toThrow(StateTamperedError);
  });

  it("rejects non-JSON body with valid signature", () => {
    const body = Buffer.from("not-json", "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const sig = createHmac("sha256", SECRET)
      .update(body)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(() => verifyState(`${body}.${sig}`, SECRET)).toThrow(StateTamperedError);
  });

  it("assertStateFresh rejects when older than TTL", () => {
    const p = payload({ createdAt: 1_000 });
    expect(() => assertStateFresh(p, 600, 1_000 + 601)).toThrow(StateExpiredError);
  });

  it("assertStateFresh accepts within TTL", () => {
    const p = payload({ createdAt: 1_000 });
    expect(() => assertStateFresh(p, 600, 1_000 + 599)).not.toThrow();
  });

  it("buildStateCookie sets required attributes", () => {
    const cookie = buildStateCookie("value", 600, "example.com");
    expect(cookie).toContain(`${STATE_COOKIE_NAME}=value`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=600");
    expect(cookie).toContain("Domain=example.com");
  });

  it("clearStateCookie uses Max-Age=0", () => {
    const cookie = clearStateCookie();
    expect(cookie).toContain("Max-Age=0");
  });

  it("readStateCookie parses the header", () => {
    const req = new Request("https://example.com/oauth/notion/callback", {
      headers: { cookie: `foo=bar; ${STATE_COOKIE_NAME}=signed.value; baz=qux` },
    });
    expect(readStateCookie(req)).toBe("signed.value");
  });

  it("readStateCookie throws when cookie missing", () => {
    const req = new Request("https://example.com/oauth/notion/callback", {
      headers: { cookie: "foo=bar" },
    });
    expect(() => readStateCookie(req)).toThrow(StateMissingError);
  });

  it("generateNonce returns hex of at least 16 bytes", () => {
    const n = generateNonce();
    expect(n).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("readStatePayloadUnverified", () => {
  it("round-trips a signed payload to its parsed userId/provider", () => {
    const p = payload();
    const signed = signState(p, SECRET);
    const parsed = readStatePayloadUnverified(signed);
    expect(parsed?.userId).toBe(p.userId);
    expect(parsed?.provider).toBe(p.provider);
    expect(parsed?.returnTo).toBe(p.returnTo);
  });

  it("extracts the state value from a full Cookie: header", () => {
    const signed = signState(payload(), SECRET);
    const header = `foo=bar; ${STATE_COOKIE_NAME}=${signed}; baz=qux`;
    const parsed = readStatePayloadUnverified(header);
    expect(parsed?.userId).toBe("user-1");
  });

  it("returns null when cookie is missing from the header", () => {
    expect(readStatePayloadUnverified("foo=bar; baz=qux")).toBeNull();
  });

  it("returns null on malformed cookie (no signature separator)", () => {
    expect(readStatePayloadUnverified("no-dot")).toBeNull();
    expect(readStatePayloadUnverified("")).toBeNull();
  });

  it("returns null on non-JSON payload body", () => {
    const badBody = Buffer.from("not-json", "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(readStatePayloadUnverified(`${badBody}.anysig`)).toBeNull();
  });

  it("returns null when JSON doesn't match the StatePayload shape", () => {
    const wrongShape = { hello: "world" };
    const body = Buffer.from(JSON.stringify(wrongShape), "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(readStatePayloadUnverified(`${body}.anysig`)).toBeNull();
  });

  it("does NOT verify the signature — a tampered sig still yields a payload", () => {
    // This is the point: the function is explicitly unverified. Callers
    // must route the cookie through verifyState before trusting it.
    const signed = signState(payload(), SECRET);
    const [body] = signed.split(".");
    const forged = `${body}.this-signature-is-bogus`;
    const parsed = readStatePayloadUnverified(forged);
    expect(parsed?.userId).toBe("user-1");
    // ...but verifyState on the same value must reject it.
    expect(() => verifyState(forged, SECRET)).toThrow(StateTamperedError);
  });
});
