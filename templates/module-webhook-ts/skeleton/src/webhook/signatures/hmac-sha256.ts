import { createHmac, timingSafeEqual } from "node:crypto";
import type { SignatureProvider } from "./types.js";
import { registerSignatureProvider } from "./registry.js";

// ── HMAC-SHA256 Signature Provider ─────────────────────────────────
//
// Signs and verifies payloads using HMAC-SHA256. Uses Node's built-in
// crypto module with timingSafeEqual to prevent timing attacks.
//

const hmacSha256Provider: SignatureProvider = {
  name: "hmac-sha256",

  sign(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
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
registerSignatureProvider(hmacSha256Provider);
