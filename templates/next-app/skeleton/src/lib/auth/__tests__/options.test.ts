import { describe, expect, it } from "vitest";
import { authOptions } from "../options";

/**
 * `authorized` is the callback NextAuth consults before a protected route
 * renders. It is the whole access decision for this app, so every shape the
 * session can arrive in is checked rather than the happy one.
 */
const authorized = authOptions.callbacks?.authorized;

describe("authorized", () => {
  it("is wired, so NextAuth has a decision to consult", () => {
    expect(authorized).toBeTypeOf("function");
  });

  it("admits a session carrying a user", () => {
    expect(authorized?.({ auth: { user: { id: "u-1" } } } as never)).toBe(true);
  });

  it("refuses a session with no user", () => {
    expect(authorized?.({ auth: { user: undefined } } as never)).toBe(false);
  });

  it("refuses a null session", () => {
    expect(authorized?.({ auth: null } as never)).toBe(false);
  });

  it("refuses an absent session", () => {
    // A route reached before the session resolves must not read as signed in.
    expect(authorized?.({ auth: undefined } as never)).toBe(false);
  });
});

describe("authOptions", () => {
  it("sends an unauthenticated visitor to the sign-in page the app ships", () => {
    expect(authOptions.pages?.signIn).toBe("/login");
  });
});
