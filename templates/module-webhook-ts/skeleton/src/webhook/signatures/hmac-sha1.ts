import { createHmac, timingSafeEqual } from "node:crypto";
import type { SignatureProvider } from "./types.js";
import { registerSignatureProvider } from "./registry.js";

// ── HMAC-SHA1 Signature Provider ───────────────────────────────────
//
// Signs and verifies payloads using HMAC-SHA1. Provided for
// compatibility with legacy webhook providers. Uses Node's built-in
// crypto module with timingSafeEqual to prevent timing attacks.
//

const hmacSha1Provider: SignatureProvider = {
  name: "hmac-sha1",

  sign(payload: string, secret: string): string {
    return createHmac("sha1", secret).update(payload).digest("hex");
  },

  verify(payload: string, signature: string, secret: string): boolean {
    const expected = this.sign(payload, secret);

    // Both must be the same length for timingSafeEqual
    if (signature.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  },
};

// Self-register
registerSignatureProvider(hmacSha1Provider);
