import { createHash } from "node:crypto";
import type { SignatureProvider } from "./types.js";
import { registerSignatureProvider } from "./registry.js";

// ── Mock Signature Provider ───────────────────────────────────────
//
// Uses a simple SHA-256 hash of the payload for signing. No HMAC
// secret is needed — the secret parameter is ignored. This makes it
// easy to test webhook sending and receiving without managing keys.
//
// NOT suitable for production use. Self-registers as "mock" on import.
//

const mockSignatureProvider: SignatureProvider = {
  name: "mock",

  sign(payload: string, _secret: string): string {
    return createHash("sha256").update(payload).digest("hex");
  },

  verify(payload: string, signature: string, _secret: string): boolean {
    const expected = this.sign(payload, "");
    return signature === expected;
  },
};

// Self-register
registerSignatureProvider(mockSignatureProvider);
