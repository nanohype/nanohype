// ── Signature Provider Interface ────────────────────────────────────
//
// All signature providers implement this interface. The registry
// pattern allows new providers to be added by importing a provider
// module that calls registerSignatureProvider() at the module level.
//

export interface SignatureProvider {
  /** Unique provider name (e.g. "hmac-sha256", "hmac-sha1"). */
  readonly name: string;

  /** Sign a payload with the given secret. Returns the signature string. */
  sign(payload: string, secret: string): string;

  /** Verify a payload against a signature using the given secret. */
  verify(payload: string, signature: string, secret: string): boolean;
}
