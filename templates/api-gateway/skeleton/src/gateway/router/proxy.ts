// ── Reverse Proxy ───────────────────────────────────────────────────
//
// Forwards an incoming request to an upstream service using native
// fetch. Streams the response body back to the client without
// buffering the entire payload in memory. Handles timeout via
// AbortController and propagates upstream errors as gateway errors.
//

import type { ProxyResponse, TransformRule } from "../types.js";
import type { Logger } from "../logger.js";

/** Headers that should not be forwarded between proxy hops. */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Build the forwarded request headers. Copies incoming headers,
 * removes hop-by-hop headers, and applies request transforms.
 */
function buildRequestHeaders(
  incomingHeaders: Headers,
  transform?: TransformRule,
): Headers {
  const headers = new Headers();

  incomingHeaders.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  if (transform?.removeRequestHeaders) {
    for (const name of transform.removeRequestHeaders) {
      headers.delete(name);
    }
  }

  if (transform?.setRequestHeaders) {
    for (const [name, value] of Object.entries(transform.setRequestHeaders)) {
      headers.set(name, value);
    }
  }

  return headers;
}

/**
 * Apply response header transforms. Modifies the response headers
 * in place before returning to the client.
 */
function applyResponseTransforms(
  headers: Record<string, string>,
  transform?: TransformRule,
): Record<string, string> {
  if (!transform) return headers;

  const result = { ...headers };

  if (transform.removeResponseHeaders) {
    for (const name of transform.removeResponseHeaders) {
      delete result[name.toLowerCase()];
    }
  }

  if (transform.setResponseHeaders) {
    for (const [name, value] of Object.entries(transform.setResponseHeaders)) {
      result[name.toLowerCase()] = value;
    }
  }

  return result;
}

/**
 * Forward a request to the upstream and return the response for
 * streaming back to the client. Uses AbortController for timeout.
 */
export async function proxyRequest(
  upstreamUrl: string,
  forwardPath: string,
  request: Request,
  logger: Logger,
  options?: {
    timeoutMs?: number;
    transform?: TransformRule;
  },
): Promise<ProxyResponse> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const targetUrl = new URL(forwardPath, upstreamUrl);

  // Preserve query string from the original request
  const originalUrl = new URL(request.url);
  targetUrl.search = originalUrl.search;

  const headers = buildRequestHeaders(request.headers, options?.transform);

  // Set X-Forwarded-* headers
  headers.set("X-Forwarded-For", request.headers.get("x-forwarded-for") ?? "");
  headers.set("X-Forwarded-Host", originalUrl.host);
  headers.set("X-Forwarded-Proto", originalUrl.protocol.replace(":", ""));

  try {
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      signal: controller.signal,
      // @ts-expect-error -- Node.js fetch supports duplex for streaming request bodies
      duplex: "half",
    });

    clearTimeout(timer);

    // Extract response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders[key.toLowerCase()] = value;
      }
    });

    const finalHeaders = applyResponseTransforms(responseHeaders, options?.transform);

    return {
      status: response.status,
      headers: finalHeaders,
      body: response.body,
    };
  } catch (err) {
    clearTimeout(timer);

    if (err instanceof DOMException && err.name === "AbortError") {
      logger.warn("Upstream request timed out", {
        upstream: upstreamUrl,
        path: forwardPath,
        timeoutMs,
      });
      return {
        status: 504,
        headers: { "content-type": "application/json" },
        body: new ReadableStream({
          start(controller) {
            const body = JSON.stringify({
              error: "Gateway Timeout",
              message: "Upstream did not respond within the timeout",
            });
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        }),
      };
    }

    logger.error("Upstream request failed", {
      upstream: upstreamUrl,
      path: forwardPath,
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      status: 502,
      headers: { "content-type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          const body = JSON.stringify({
            error: "Bad Gateway",
            message: "Failed to reach upstream service",
          });
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
    };
  }
}
