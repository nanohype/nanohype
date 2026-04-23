import { describe, it, expect, beforeEach } from "vitest";
import {
  registerProvider,
  getProvider,
  listProviders,
} from "../providers/registry.js";
import type { AuthProvider } from "../providers/types.js";

/**
 * Build a minimal stub provider for testing the registry in isolation.
 */
function stubProvider(name: string): AuthProvider {
  return {
    name,
    async verifyRequest() {
      return { authenticated: false, error: "stub" };
    },
  };
}

describe("auth provider registry", () => {
  // The registry is a module-level Map. To test in isolation we
  // re-register providers with unique names per test run so we do not
  // depend on side-effect imports from the real provider modules.

  const unique = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("registers a factory and retrieves a provider by name", () => {
    const name = unique();
    const provider = stubProvider(name);

    registerProvider(name, () => provider);

    const result = getProvider(name);
    expect(result?.name).toBe(name);
  });

  it("returns undefined for an unregistered provider", () => {
    expect(getProvider("nonexistent-provider")).toBeUndefined();
  });

  it("lists all registered provider names", () => {
    const a = unique();
    const b = unique();

    registerProvider(a, () => stubProvider(a));
    registerProvider(b, () => stubProvider(b));

    const names = listProviders();
    expect(names).toContain(a);
    expect(names).toContain(b);
  });

  it("replaces a factory when re-registered with the same name", () => {
    const name = unique();
    const first = stubProvider(name);
    const second = stubProvider(name);

    registerProvider(name, () => first);
    registerProvider(name, () => second);

    expect(getProvider(name)).toBe(second);
  });

  it("returns a fresh instance on each getProvider call", () => {
    const name = unique();

    registerProvider(name, () => stubProvider(name));

    const a = getProvider(name);
    const b = getProvider(name);
    expect(a).not.toBe(b);
    expect(a?.name).toBe(name);
    expect(b?.name).toBe(name);
  });
});
