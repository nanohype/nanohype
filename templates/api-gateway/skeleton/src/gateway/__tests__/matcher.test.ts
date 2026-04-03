import { describe, it, expect } from "vitest";
import { pathMatches, methodMatches, computeForwardPath, matchRoute } from "../router/matcher.js";
import type { RouteRule } from "../types.js";

// ── Matcher Tests ───────────────────────────────────────────────────
//
// Validates path matching (exact, wildcard, trailing slash), method
// filtering, prefix stripping, and first-match route selection.
//

describe("pathMatches", () => {
  it("matches exact paths", () => {
    expect(pathMatches("/api/users", "/api/users")).toBe(true);
  });

  it("rejects non-matching exact paths", () => {
    expect(pathMatches("/api/users", "/api/posts")).toBe(false);
  });

  it("matches wildcard paths", () => {
    expect(pathMatches("/api/users/*", "/api/users/123")).toBe(true);
    expect(pathMatches("/api/users/*", "/api/users/123/posts")).toBe(true);
  });

  it("matches wildcard prefix without trailing segment", () => {
    expect(pathMatches("/api/users/*", "/api/users")).toBe(true);
  });

  it("rejects wildcard when prefix does not match", () => {
    expect(pathMatches("/api/users/*", "/api/posts/123")).toBe(false);
  });

  it("normalizes trailing slashes", () => {
    expect(pathMatches("/api/users", "/api/users/")).toBe(true);
    expect(pathMatches("/api/users/", "/api/users")).toBe(true);
  });

  it("matches root path", () => {
    expect(pathMatches("/", "/")).toBe(true);
  });

  it("matches nested wildcard", () => {
    expect(pathMatches("/v1/api/*", "/v1/api/users/123/settings")).toBe(true);
  });
});

describe("methodMatches", () => {
  it("allows any method when methods array is empty", () => {
    const rule: RouteRule = { path: "/", methods: [], upstream: "http://up:3000" };
    expect(methodMatches(rule, "GET")).toBe(true);
    expect(methodMatches(rule, "POST")).toBe(true);
    expect(methodMatches(rule, "DELETE")).toBe(true);
  });

  it("allows listed methods", () => {
    const rule: RouteRule = { path: "/", methods: ["GET", "POST"], upstream: "http://up:3000" };
    expect(methodMatches(rule, "GET")).toBe(true);
    expect(methodMatches(rule, "POST")).toBe(true);
  });

  it("rejects unlisted methods", () => {
    const rule: RouteRule = { path: "/", methods: ["GET"], upstream: "http://up:3000" };
    expect(methodMatches(rule, "POST")).toBe(false);
  });

  it("normalizes method case", () => {
    const rule: RouteRule = { path: "/", methods: ["GET"], upstream: "http://up:3000" };
    expect(methodMatches(rule, "get")).toBe(true);
  });
});

describe("computeForwardPath", () => {
  it("returns the original path when stripPrefix is false", () => {
    const rule: RouteRule = { path: "/api/v1/*", methods: [], upstream: "http://up:3000" };
    expect(computeForwardPath(rule, "/api/v1/users")).toBe("/api/v1/users");
  });

  it("strips the prefix when stripPrefix is true", () => {
    const rule: RouteRule = {
      path: "/api/v1/*",
      methods: [],
      upstream: "http://up:3000",
      stripPrefix: true,
    };
    expect(computeForwardPath(rule, "/api/v1/users")).toBe("/users");
  });

  it("returns root when entire path is stripped", () => {
    const rule: RouteRule = {
      path: "/api/v1",
      methods: [],
      upstream: "http://up:3000",
      stripPrefix: true,
    };
    expect(computeForwardPath(rule, "/api/v1")).toBe("/");
  });
});

describe("matchRoute", () => {
  const rules: RouteRule[] = [
    { path: "/api/users/*", methods: ["GET", "POST"], upstream: "http://users:3001" },
    { path: "/api/posts/*", methods: [], upstream: "http://posts:3002" },
    { path: "/api/admin/*", methods: ["GET"], upstream: "http://admin:3003" },
  ];

  it("returns the first matching rule", () => {
    const result = matchRoute(rules, "/api/users/123", "GET");
    expect(result).not.toBeNull();
    expect(result!.upstreamUrl).toBe("http://users:3001");
  });

  it("returns null when no rule matches", () => {
    const result = matchRoute(rules, "/api/billing/123", "GET");
    expect(result).toBeNull();
  });

  it("respects method filtering", () => {
    const result = matchRoute(rules, "/api/users/123", "DELETE");
    expect(result).toBeNull();
  });

  it("matches wildcard methods", () => {
    const result = matchRoute(rules, "/api/posts/456", "PATCH");
    expect(result).not.toBeNull();
    expect(result!.upstreamUrl).toBe("http://posts:3002");
  });

  it("includes the forward path in the result", () => {
    const result = matchRoute(rules, "/api/users/123", "GET");
    expect(result!.forwardPath).toBe("/api/users/123");
  });
});
