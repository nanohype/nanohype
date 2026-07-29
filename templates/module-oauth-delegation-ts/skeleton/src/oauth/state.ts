// ── Signed stateless state cookie ────────────────────────────────────
//
// The state cookie carries the PKCE code verifier and CSRF nonce across
// the redirect boundary. It is HMAC-SHA256 signed so there is no
// server-side state table. On callback we recompute the HMAC with
// timingSafeEqual and reject on mismatch.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { StateExpiredError, StateMissingError, StateTamperedError } from "./errors.js";

export interface StatePayload {
  /** Opaque nonce — echoed back by the provider as the `state` query param. */
  nonce: string;
  userId: string;
  provider: string;
  returnTo: string;
  /** Unix seconds. */
  createdAt: number;
  /** PKCE code verifier (base64url). Empty when provider.usePkce is false. */
  codeVerifier: string;
}

export const STATE_COOKIE_NAME = "__oauth_state";

function b64urlEncode(s: string | Buffer): string {
  const buf = typeof s === "string" ? Buffer.from(s, "utf-8") : s;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  // Restore padding to make Buffer.from('base64') happy.
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

function hmac(secret: string, body: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

/**
 * Encode and sign a state payload. Format: `<b64url(JSON)>.<b64url(hmac)>`.
 */
export function signState(payload: StatePayload, secret: string): string {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(hmac(secret, body));
  return `${body}.${sig}`;
}

/**
 * Verify the HMAC signature and parse the payload. Throws
 * {@link StateTamperedError} on signature mismatch.
 */
export function verifyState(signed: string, secret: string): StatePayload {
  const dot = signed.lastIndexOf(".");
  if (dot < 1 || dot === signed.length - 1) throw new StateTamperedError();

  const body = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);

  const expected = hmac(secret, body);
  const actual = b64urlDecode(sig);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new StateTamperedError();
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf-8")) as StatePayload;
  } catch {
    throw new StateTamperedError();
  }

  return payload;
}

/** Reject when `now - createdAt > ttlSeconds`. */
export function assertStateFresh(payload: StatePayload, ttlSeconds: number, now: number): void {
  if (now - payload.createdAt > ttlSeconds) throw new StateExpiredError();
}

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Serialize a `Set-Cookie` header for the state cookie. `HttpOnly`,
 * `Secure`, `SameSite=Lax` — the cookie is only attached on top-level
 * navigations to the callback, which is enough for the OAuth flow and
 * resists CSRF.
 */
export function buildStateCookie(value: string, ttlSeconds: number, domain?: string): string {
  const parts = [
    `${STATE_COOKIE_NAME}=${value}`,
    "Path=/oauth",
    `Max-Age=${ttlSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

/** Serialize a `Set-Cookie` header that clears the state cookie. */
export function clearStateCookie(domain?: string): string {
  const parts = [
    `${STATE_COOKIE_NAME}=`,
    "Path=/oauth",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

/**
 * Read the signed state cookie value from a request's `Cookie` header,
 * or throw {@link StateMissingError} when absent.
 */
export function readStateCookie(req: Request): string {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === STATE_COOKIE_NAME) return rest.join("=");
  }
  throw new StateMissingError();
}

function isStatePayload(value: unknown): value is StatePayload {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.nonce === "string" &&
    typeof v.userId === "string" &&
    typeof v.provider === "string" &&
    typeof v.returnTo === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.codeVerifier === "string"
  );
}

/**
 * Parse a state-cookie value **without** verifying the HMAC signature.
 *
 * Useful for consumers whose own `resolveUserId` implementation has no
 * parallel auth signal on `/callback` and needs to recover the userId
 * from the cookie for routing. The module's handlers re-verify the
 * HMAC before trusting the payload, so this peek cannot be used to
 * bypass anything — a forged cookie is caught at the
 * {@link verifyState} step in the `/callback` handler.
 *
 * **Contract:** the returned payload is untrusted. Callers MUST NOT
 * make authorization decisions from it on their own.
 *
 * Accepts either a raw `Cookie:` header string (e.g.
 * `"foo=bar; __oauth_state=<value>"`) or the already-extracted cookie
 * value (just the signed `<body>.<sig>` part). Returns `null` when the
 * cookie is missing, malformed, or the payload doesn't match
 * {@link StatePayload}.
 */
export function readStatePayloadUnverified(cookieHeaderOrValue: string): StatePayload | null {
  if (!cookieHeaderOrValue) return null;

  // If it's a raw Cookie header (has "name=value" pairs separated by `;`
  // or `=` appears before the first `.`), extract the state-cookie value.
  let raw = cookieHeaderOrValue;
  if (raw.includes(";") || (raw.includes("=") && raw.indexOf("=") < raw.indexOf("."))) {
    let found: string | null = null;
    for (const part of raw.split(";")) {
      const [k, ...rest] = part.trim().split("=");
      if (k === STATE_COOKIE_NAME) {
        found = rest.join("=");
        break;
      }
    }
    if (found === null) return null;
    raw = found;
  }

  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  try {
    const parsed = JSON.parse(b64urlDecode(body).toString("utf-8"));
    return isStatePayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
