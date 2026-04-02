import { describe, it, expect } from "vitest";

// Import the provider module to trigger self-registration
import "../signatures/hmac-sha256.js";
import { getSignatureProvider } from "../signatures/registry.js";

describe("hmac-sha256 signature provider", () => {
  const provider = getSignatureProvider("hmac-sha256");
  const secret = "test-secret-key";
  const payload = '{"event":"push","payload":{"ref":"main"}}';

  it("is registered under the name 'hmac-sha256'", () => {
    expect(provider.name).toBe("hmac-sha256");
  });

  it("produces a hex-encoded signature", () => {
    const signature = provider.sign(payload, secret);

    expect(typeof signature).toBe("string");
    expect(signature).toMatch(/^[a-f0-9]+$/);
  });

  it("verifies a valid signature round-trip", () => {
    const signature = provider.sign(payload, secret);
    const valid = provider.verify(payload, signature, secret);

    expect(valid).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const valid = provider.verify(payload, "deadbeef0000", secret);

    expect(valid).toBe(false);
  });

  it("rejects a signature with a different secret", () => {
    const signature = provider.sign(payload, secret);
    const valid = provider.verify(payload, signature, "wrong-secret");

    expect(valid).toBe(false);
  });

  it("rejects a signature with a tampered payload", () => {
    const signature = provider.sign(payload, secret);
    const tampered = payload.replace("push", "pull");
    const valid = provider.verify(tampered, signature, secret);

    expect(valid).toBe(false);
  });

  it("produces deterministic signatures for the same input", () => {
    const sig1 = provider.sign(payload, secret);
    const sig2 = provider.sign(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it("produces different signatures for different payloads", () => {
    const sig1 = provider.sign("payload-a", secret);
    const sig2 = provider.sign("payload-b", secret);

    expect(sig1).not.toBe(sig2);
  });
});
