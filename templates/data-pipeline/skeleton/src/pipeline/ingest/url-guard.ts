/**
 * SSRF guard for the web ingest source.
 *
 * Rejects URLs that would let an operator-supplied source pivot into internal
 * services (cloud metadata at 169.254.169.254, RFC1918 subnets, loopback,
 * link-local). Run before every outbound fetch on operator-controlled URLs. The
 * hostname is resolved once here so the address we gate on is the one fetched;
 * DNS-rebinding remains a theoretical residual risk.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface UrlGuardOptions {
  readonly allowedSchemes?: readonly string[];
}

const DEFAULT_SCHEMES = ["http:", "https:"] as const;

export class UrlGuardError extends Error {
  constructor(
    public readonly reason: string,
    public readonly url: string,
  ) {
    super(`URL guard rejected ${url}: ${reason}`);
    this.name = "UrlGuardError";
  }
}

export async function guardUrl(rawUrl: string, options: UrlGuardOptions = {}): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UrlGuardError("malformed URL", rawUrl);
  }

  const schemes = options.allowedSchemes ?? DEFAULT_SCHEMES;
  if (!schemes.includes(parsed.protocol)) {
    throw new UrlGuardError(`scheme ${parsed.protocol} not allowed`, rawUrl);
  }

  const host = parsed.hostname;
  if (!host) {
    throw new UrlGuardError("missing host", rawUrl);
  }

  // URL.hostname wraps IPv6 literals in brackets ([::1]); isIP wants the bare address.
  const bareHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const addresses = isIP(bareHost) ? [bareHost] : [(await lookup(bareHost)).address];
  for (const addr of addresses) {
    if (isBlockedAddress(addr)) {
      throw new UrlGuardError(`resolves to blocked address ${addr}`, rawUrl);
    }
  }

  return parsed;
}

function isBlockedAddress(addr: string): boolean {
  // IPv4 private + loopback + link-local + cloud metadata.
  if (isIP(addr) === 4) {
    const parts = addr.split(".").map(Number);
    const [a = 0, b = 0] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // includes 169.254.169.254 cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    return false;
  }

  // IPv6: loopback, link-local (fe80::/10), unique-local (fc00::/7), unspecified.
  const lower = addr.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}
