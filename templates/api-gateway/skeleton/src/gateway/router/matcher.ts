// ── Route Matcher ───────────────────────────────────────────────────
//
// Matches an incoming request path and method against the configured
// route rules. Supports exact paths, prefix matching with trailing
// wildcard ("/api/users/*"), and optional method filtering. Returns
// the first matching rule — order in the configuration matters.
//

import type { RouteRule } from "../types.js";
import type { MatchResult } from "./types.js";

/**
 * Test whether a request path matches a route pattern.
 *
 * - Exact match: "/api/users" matches "/api/users"
 * - Wildcard: "/api/users/*" matches "/api/users/123" and "/api/users/123/posts"
 * - Trailing slash normalization: "/api/users/" matches "/api/users"
 */
export function pathMatches(pattern: string, requestPath: string): boolean {
  const normalizedPattern = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
  const normalizedPath = requestPath.endsWith("/") && requestPath.length > 1
    ? requestPath.slice(0, -1)
    : requestPath;

  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -2);
    return normalizedPath === prefix || normalizedPath.startsWith(prefix + "/");
  }

  return normalizedPath === normalizedPattern;
}

/**
 * Test whether a request method is allowed by a route rule.
 * An empty methods array means all methods are allowed.
 */
export function methodMatches(rule: RouteRule, method: string): boolean {
  if (rule.methods.length === 0) return true;
  return rule.methods.includes(method.toUpperCase());
}

/**
 * Compute the forwarded path. When stripPrefix is true, the matched
 * prefix is removed from the path before forwarding.
 */
export function computeForwardPath(rule: RouteRule, requestPath: string): string {
  if (!rule.stripPrefix) return requestPath;

  const pattern = rule.path.endsWith("/*")
    ? rule.path.slice(0, -2)
    : rule.path;

  if (requestPath.startsWith(pattern)) {
    const stripped = requestPath.slice(pattern.length);
    return stripped.startsWith("/") ? stripped : "/" + stripped;
  }

  return requestPath;
}

/**
 * Resolve the upstream URL from a route rule. For simple string
 * upstreams, returns the URL directly. For canary configurations,
 * the caller must handle splitting separately — this returns the
 * primary URL as a default.
 */
function resolveUpstreamUrl(rule: RouteRule): string {
  if (typeof rule.upstream === "string") {
    return rule.upstream;
  }
  return rule.upstream.primary;
}

/**
 * Find the first route rule matching the given path and method.
 * Returns null if no rule matches.
 */
export function matchRoute(
  rules: RouteRule[],
  path: string,
  method: string,
): MatchResult | null {
  for (const rule of rules) {
    if (pathMatches(rule.path, path) && methodMatches(rule, method)) {
      return {
        rule,
        upstreamUrl: resolveUpstreamUrl(rule),
        forwardPath: computeForwardPath(rule, path),
      };
    }
  }

  return null;
}
