import { describe, expect, it, vi } from "vitest";
import { authOptions } from "../options";

/**
 * The NextAuth construction. It is three statements and one of them runs:
 * `NextAuth(...)` builds the handlers every protected route is wired to, from
 * the options asserted beside this. Faking the framework leaves the wiring —
 * which options object reaches it, and which handles come back out — as the
 * thing under test.
 */

// The rest parameter is what lets the mock below forward its arguments: a
// spread into a function declared with none is not assignable, whatever the
// call passes.
const nextAuth = vi.fn((..._args: unknown[]) => ({
  handlers: { GET: () => undefined, POST: () => undefined },
  auth: () => undefined,
  signIn: () => undefined,
  signOut: () => undefined,
}));

vi.mock("next-auth", () => ({ default: (...args: unknown[]) => nextAuth(...args) }));

describe("config", () => {
  it("builds NextAuth from the options asserted beside it", async () => {
    const config = await import("../config");

    expect(nextAuth).toHaveBeenCalledWith(authOptions);
    for (const name of ["handlers", "auth", "signIn", "signOut"]) {
      expect(config).toHaveProperty(name);
    }
  });
});
