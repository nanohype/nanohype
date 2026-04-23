import { describe, it, expect } from "vitest";
import {
  registerSignatureProvider,
  getSignatureProvider,
  listSignatureProviders,
} from "../signatures/registry.js";
import type { SignatureProvider } from "../signatures/types.js";

/**
 * Build a minimal stub provider for testing the registry in isolation.
 */
function stubProvider(name: string): SignatureProvider {
  return {
    name,
    sign(_payload: string, _secret: string) {
      return "stub-signature";
    },
    verify(_payload: string, _signature: string, _secret: string) {
      return true;
    },
  };
}

describe("signature provider registry", () => {
  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a provider and retrieves it by name", () => {
    const name = unique();
    const provider = stubProvider(name);

    registerSignatureProvider(provider);

    expect(getSignatureProvider(name)).toBe(provider);
  });

  it("throws when retrieving an unregistered provider", () => {
    expect(() => getSignatureProvider("nonexistent-provider")).toThrow(
      /not found/,
    );
  });

  it("throws when registering a duplicate provider name", () => {
    const name = unique();
    registerSignatureProvider(stubProvider(name));

    expect(() => registerSignatureProvider(stubProvider(name))).toThrow(
      /already registered/,
    );
  });

  it("lists all registered provider names", () => {
    const a = unique();
    const b = unique();

    registerSignatureProvider(stubProvider(a));
    registerSignatureProvider(stubProvider(b));

    const names = listSignatureProviders();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });
});
