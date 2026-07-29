// ── PKCE (RFC 7636) ──────────────────────────────────────────────────
//
// S256 only. The verifier lives in the signed state cookie; the
// challenge goes on the wire to the auth server. The same verifier is
// replayed to the token endpoint on the callback's code exchange.

import { createHash, randomBytes } from "node:crypto";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 32 random bytes → base64url, which yields a 43-character verifier.
 * That's well within RFC 7636's 43–128 range and gives 256 bits of entropy.
 */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

/** S256: base64url(sha256(verifier)). */
export function codeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}
