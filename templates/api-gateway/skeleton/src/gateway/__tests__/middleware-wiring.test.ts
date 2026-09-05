import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGateway } from "../index.js";
import { proxyRequest } from "../router/proxy.js";
import type { GatewayConfig, RouteRule } from "../types.js";

// ── Middleware Wiring Tests ─────────────────────────────────────────
//
// Validates what createGateway composes around each route: which
// middleware a rule mounts, which upstream the catch-all resolves, and
// which of the three gates in front of the proxy — auth, circuit
// breaker, health — refuses a request before it reaches an upstream.
//
// The auth assertions are the load-bearing ones. A route declaring an
// auth mode must refuse an uncredentialed request, and the refusal has
// to happen before fetch is reached: a 401 that still forwarded the
// request is an open gateway.
//

// The standalone server tail boots on import. Stubbing the listener
// keeps the suite off a port; `entrypoint.test.ts` drives that tail.
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(() => ({ close: vi.fn() })),
}));

// A pass-through spy over the real proxy: the options argument carries
// the timeout and transform the gateway resolved, and those decisions
// are unobservable from the response alone.
vi.mock("../router/proxy.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../router/proxy.js")>();
  return { ...actual, proxyRequest: vi.fn(actual.proxyRequest) };
});

const JWT_SECRET = "middleware-wiring-secret";

function makeConfig(routes: RouteRule[], overrides?: Partial<GatewayConfig>): GatewayConfig {
  return { port: 9999, routes, healthCheckEnabled: false, ...overrides };
}

/** A fetch stub that answers every upstream call with the given response. */
function stubUpstream(response: () => Response) {
  const fetchMock = vi.fn(() => Promise.resolve(response()));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
}

describe("createGateway auth wiring", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.mocked(proxyRequest).mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("refuses a jwt route request that carries no Authorization header", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig(
        [{ path: "/api/private/*", methods: [], upstream: "http://private:3001", auth: "jwt" }],
        { jwtSecret: JWT_SECRET, logLevel: "error" },
      ),
    );

    const response = await app.request("/api/private/thing");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Bearer token required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(proxyRequest)).not.toHaveBeenCalled();
    shutdown();
  });

  it("refuses a Bearer token not signed with the configured secret", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const forged = await new SignJWT({ sub: "intruder" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("a-different-secret"));

    const { app, shutdown } = createGateway(
      makeConfig(
        [{ path: "/api/private/*", methods: [], upstream: "http://private:3001", auth: "jwt" }],
        { jwtSecret: JWT_SECRET, logLevel: "error" },
      ),
    );

    const response = await app.request("/api/private/thing", {
      headers: { authorization: `Bearer ${forged}` },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    shutdown();
  });

  it("forwards a request whose Bearer token verifies against the configured secret", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(JWT_SECRET));

    const { app, shutdown } = createGateway(
      makeConfig(
        [{ path: "/api/private/*", methods: [], upstream: "http://private:3001", auth: "jwt" }],
        { jwtSecret: JWT_SECRET, logLevel: "error" },
      ),
    );

    const response = await app.request("/api/private/thing", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    shutdown();
  });

  it("refuses an api-key route request that carries no key", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig(
        [{ path: "/api/keyed/*", methods: [], upstream: "http://keyed:3001", auth: "api-key" }],
        { apiKeys: ["known-key"], logLevel: "error" },
      ),
    );

    const response = await app.request("/api/keyed/thing");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "API key required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    shutdown();
  });

  it("refuses an api-key route request carrying a key outside the configured set", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig(
        [{ path: "/api/keyed/*", methods: [], upstream: "http://keyed:3001", auth: "api-key" }],
        { apiKeys: ["known-key"], logLevel: "error" },
      ),
    );

    const response = await app.request("/api/keyed/thing", {
      headers: { "x-api-key": "guessed-key" },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Invalid API key",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    shutdown();
  });

  it("forwards an api-key route request carrying a configured key", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig(
        [{ path: "/api/keyed/*", methods: [], upstream: "http://keyed:3001", auth: "api-key" }],
        { apiKeys: ["known-key"], logLevel: "error" },
      ),
    );

    const response = await app.request("/api/keyed/thing", {
      headers: { "x-api-key": "known-key" },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    shutdown();
  });

  it("mounts no auth gate on a route declaring auth none", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig([
        { path: "/api/open/*", methods: [], upstream: "http://open:3001", auth: "none" },
      ]),
    );

    const response = await app.request("/api/open/thing");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    shutdown();
  });
});

describe("createGateway auth wiring without a configured credential", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.mocked(proxyRequest).mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // A route naming an auth mode is gated on the mode it names, not on
  // whether the credential that mode needs was supplied. A gateway that
  // mounts the gate only when a secret is present answers a
  // misconfiguration by serving the route to anyone.

  it("refuses a jwt route request when the configuration names no secret", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig(
        [{ path: "/api/private/*", methods: [], upstream: "http://private:3001", auth: "jwt" }],
        { logLevel: "error" },
      ),
    );

    const response = await app.request("/api/private/thing");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Bearer token required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(proxyRequest)).not.toHaveBeenCalled();
    shutdown();
  });

  it("refuses a signed Bearer token when the configuration names no secret to verify it", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(JWT_SECRET));

    const { app, shutdown } = createGateway(
      makeConfig(
        [{ path: "/api/private/*", methods: [], upstream: "http://private:3001", auth: "jwt" }],
        { logLevel: "error" },
      ),
    );

    const response = await app.request("/api/private/thing", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    shutdown();
  });

  it("refuses an api-key route request when the configuration names no keys", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig(
        [{ path: "/api/keyed/*", methods: [], upstream: "http://keyed:3001", auth: "api-key" }],
        { logLevel: "error" },
      ),
    );

    const response = await app.request("/api/keyed/thing", {
      headers: { "x-api-key": "known-key" },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Invalid API key",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    shutdown();
  });
});

describe("createGateway per-route middleware", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.mocked(proxyRequest).mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("answers a preflight from the route's own cors rule without reaching the upstream", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig([
        {
          path: "/api/cors/*",
          methods: [],
          upstream: "http://cors:3001",
          cors: { origins: ["https://app.example.com"] },
        },
      ]),
    );

    const response = await app.request("/api/cors/thing", {
      method: "OPTIONS",
      headers: { origin: "https://app.example.com" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(fetchMock).not.toHaveBeenCalled();
    shutdown();
  });

  it("rejects the request that exhausts the route's own rate limit", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig([
        {
          path: "/api/limited",
          methods: ["GET"],
          upstream: "http://limited:3001",
          rateLimit: { limit: 1, window: 60 },
        },
      ]),
    );

    const first = await app.request("/api/limited");
    const second = await app.request("/api/limited");

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    shutdown();
  });

  it("hands the route's transform rule to the proxy", async () => {
    stubUpstream(() => new Response("upstream", { status: 200 }));
    const transform = { setRequestHeaders: { "x-tenant": "acme" } };
    const { app, shutdown } = createGateway(
      makeConfig([
        { path: "/api/shaped/*", methods: [], upstream: "http://shaped:3001", transform },
      ]),
    );

    await app.request("/api/shaped/thing");

    expect(vi.mocked(proxyRequest)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(proxyRequest).mock.calls[0]![4]).toMatchObject({ transform });
    shutdown();
  });

  it("hands no transform to the proxy for a route that declares none", async () => {
    stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(
      makeConfig([{ path: "/api/plain/*", methods: [], upstream: "http://plain:3001" }]),
    );

    await app.request("/api/plain/thing");

    expect(vi.mocked(proxyRequest).mock.calls[0]![4]).toMatchObject({ transform: undefined });
    shutdown();
  });
});

describe("createGateway middleware chain", () => {
  let originalFetch: typeof globalThis.fetch;

  // One route declaring every middleware the wiring knows about. The chain
  // is cors, then auth, then rate limit, then transform, so a gate that is
  // only mounted when it happens to come first is a gate that disappears
  // the moment a route also declares cors.
  const chainRoute: RouteRule = {
    path: "/api/chain/*",
    methods: [],
    upstream: "http://chain:3001",
    cors: { origins: ["https://app.example.com"] },
    auth: "api-key",
    rateLimit: { limit: 1, window: 60 },
    transform: { setRequestHeaders: { "x-tenant": "acme" } },
  };

  function chainConfig(): GatewayConfig {
    return makeConfig([chainRoute], { apiKeys: ["known-key"], logLevel: "error" });
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.mocked(proxyRequest).mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("mounts the auth gate a route declares behind cors", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(chainConfig());

    const response = await app.request("/api/chain/thing", {
      headers: { origin: "https://app.example.com" },
    });

    // The first link answered — the origin is allowed — and the second
    // still refused the uncredentialed request.
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "API key required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(proxyRequest)).not.toHaveBeenCalled();
    shutdown();
  });

  it("mounts the rate limit a route declares behind cors and auth", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown } = createGateway(chainConfig());
    const headers = { origin: "https://app.example.com", "x-api-key": "known-key" };

    const first = await app.request("/api/chain/thing", { headers });
    const second = await app.request("/api/chain/thing", { headers });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    shutdown();
  });
});

describe("createGateway timeout resolution", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.mocked(proxyRequest).mockClear();
    stubUpstream(() => new Response("upstream", { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("prefers the route's own timeout", async () => {
    const { app, shutdown } = createGateway(
      makeConfig(
        [
          {
            path: "/api/slow/*",
            methods: [],
            upstream: "http://slow:3001",
            timeoutMs: 1234,
          },
        ],
        { defaultTimeoutMs: 4321 },
      ),
    );

    await app.request("/api/slow/thing");

    expect(vi.mocked(proxyRequest).mock.calls[0]![4]).toMatchObject({ timeoutMs: 1234 });
    shutdown();
  });

  it("falls back to the gateway default when the route names none", async () => {
    const { app, shutdown } = createGateway(
      makeConfig([{ path: "/api/slow/*", methods: [], upstream: "http://slow:3001" }], {
        defaultTimeoutMs: 4321,
      }),
    );

    await app.request("/api/slow/thing");

    expect(vi.mocked(proxyRequest).mock.calls[0]![4]).toMatchObject({ timeoutMs: 4321 });
    shutdown();
  });

  it("falls back to thirty seconds when neither names a timeout", async () => {
    const { app, shutdown } = createGateway(
      makeConfig([{ path: "/api/slow/*", methods: [], upstream: "http://slow:3001" }]),
    );

    await app.request("/api/slow/thing");

    expect(vi.mocked(proxyRequest).mock.calls[0]![4]).toMatchObject({ timeoutMs: 30_000 });
    shutdown();
  });
});

describe("createGateway upstream gates", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.mocked(proxyRequest).mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("routes a canary rule to the canary upstream at a hundred percent", async () => {
    const targets: string[] = [];
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      targets.push(String(url));
      return Promise.resolve(new Response("upstream", { status: 200 }));
    }) as unknown as typeof globalThis.fetch;

    const { app, shutdown, healthChecker } = createGateway(
      makeConfig(
        [
          {
            path: "/api/split/*",
            methods: [],
            upstream: {
              primary: "http://v1:3001",
              canary: "http://v2:3001",
              canaryPercent: 100,
            },
          },
          { path: "/api/steady/*", methods: [], upstream: "http://steady:3001" },
        ],
        { healthCheckEnabled: undefined },
      ),
    );

    // Both halves of a canary rule are health-checked, not only the one a
    // given request happened to select.
    expect(healthChecker.status().map((upstream) => upstream.url)).toEqual([
      "http://v1:3001",
      "http://v2:3001",
      "http://steady:3001",
    ]);

    const split = await app.request("/api/split/thing");
    const steady = await app.request("/api/steady/thing");

    expect(split.status).toBe(200);
    expect(steady.status).toBe(200);
    expect(targets).toEqual([
      "http://v2:3001/api/split/thing",
      "http://steady:3001/api/steady/thing",
    ]);
    shutdown();
  });

  it("refuses a request to an upstream the health checker has marked unhealthy", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("connection refused")) as unknown as typeof globalThis.fetch;
    globalThis.fetch = fetchMock;

    const { app, shutdown } = createGateway(
      makeConfig([{ path: "/api/flaky/*", methods: [], upstream: "http://flaky:3001" }], {
        healthCheckEnabled: true,
        logLevel: "error",
      }),
    );

    // Three consecutive interval failures reach the default threshold.
    await vi.advanceTimersByTimeAsync(90_000);

    const response = await app.request("/api/flaky/thing");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Service Unavailable",
      message: "Upstream is unhealthy",
    });
    expect(vi.mocked(proxyRequest)).not.toHaveBeenCalled();
    shutdown();
  });

  it("opens the circuit breaker after a run of upstream failures and fails fast after", async () => {
    const fetchMock = stubUpstream(() => new Response("boom", { status: 500 }));
    const { app, shutdown } = createGateway(
      makeConfig([{ path: "/api/broken/*", methods: [], upstream: "http://broken:3001" }], {
        logLevel: "error",
      }),
    );

    for (let i = 0; i < 5; i++) {
      const failing = await app.request("/api/broken/thing");
      expect(failing.status).toBe(500);
    }

    const rejected = await app.request("/api/broken/thing");

    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toEqual({
      error: "Service Unavailable",
      message: "Upstream circuit breaker is open",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    shutdown();
  });

  it("gates a canary request on the health of the upstream the split selected", async () => {
    vi.useFakeTimers();
    // Only the canary half fails its checks, so the two halves of the rule
    // disagree: reading the declared primary's health answers healthy while
    // the half a hundred-percent split selects is down.
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      if (String(url) === "http://canary:3001/health") {
        return Promise.reject(new Error("connection refused"));
      }
      return Promise.resolve(new Response("upstream", { status: 200 }));
    }) as unknown as typeof globalThis.fetch;

    const { app, shutdown, healthChecker } = createGateway(
      makeConfig(
        [
          {
            path: "/api/split/*",
            methods: [],
            upstream: {
              primary: "http://primary:3001",
              canary: "http://canary:3001",
              canaryPercent: 100,
            },
          },
        ],
        { healthCheckEnabled: true, logLevel: "error" },
      ),
    );

    // Three consecutive interval failures reach the default threshold.
    await vi.advanceTimersByTimeAsync(90_000);

    expect(healthChecker.status()).toEqual([
      { url: "http://primary:3001", healthy: true, consecutiveFailures: 0 },
      { url: "http://canary:3001", healthy: false, consecutiveFailures: 3 },
    ]);

    const response = await app.request("/api/split/thing");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Service Unavailable",
      message: "Upstream is unhealthy",
    });
    expect(vi.mocked(proxyRequest)).not.toHaveBeenCalled();
    shutdown();
  });

  it("records a canary failure against the upstream that served it", async () => {
    const fetchMock = stubUpstream(() => new Response("boom", { status: 500 }));
    const { app, shutdown } = createGateway(
      makeConfig(
        [
          {
            path: "/api/split/*",
            methods: [],
            upstream: {
              primary: "http://primary:3001",
              canary: "http://canary:3001",
              canaryPercent: 100,
            },
          },
          { path: "/api/canary-direct/*", methods: [], upstream: "http://canary:3001" },
        ],
        { logLevel: "error" },
      ),
    );

    for (let i = 0; i < 5; i++) {
      const failing = await app.request("/api/split/thing");
      expect(failing.status).toBe(500);
    }

    // Breakers are keyed by upstream URL, so a second route naming the
    // canary directly fails fast on the failures the split recorded — which
    // it does only if those failures were recorded against the canary.
    const direct = await app.request("/api/canary-direct/thing");

    expect(direct.status).toBe(503);
    expect(await direct.json()).toEqual({
      error: "Service Unavailable",
      message: "Upstream circuit breaker is open",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    shutdown();
  });

  it("keeps the circuit closed while the upstream answers", async () => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status: 200 }));
    const { app, shutdown, healthChecker } = createGateway(
      makeConfig([{ path: "/api/healthy/*", methods: [], upstream: "http://healthy:3001" }]),
    );

    // healthCheckEnabled false registers nothing, so nothing is polled.
    expect(healthChecker.status()).toEqual([]);

    for (let i = 0; i < 6; i++) {
      const response = await app.request("/api/healthy/thing");
      expect(response.status).toBe(200);
    }

    expect(fetchMock).toHaveBeenCalledTimes(6);
    shutdown();
  });
});

describe("createGateway proxy arguments", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.mocked(proxyRequest).mockClear();
    stubUpstream(() => new Response("upstream", { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Four of the proxy's five arguments are invisible in the response.
  // A request sent to the rule's declared primary instead of the
  // upstream the split selected, or forwarded under the client's path
  // instead of the stripped one, or rebuilt from that path instead of
  // handed the client's own request, all answer 200 with the same body.
  // Every case below names all five.

  const LOGGER_LEVELS = ["debug", "error", "info", "warn"];

  /**
   * The arguments of a single proxy call, with the forwarded request
   * reduced to what separates the client's own request from one rebuilt
   * out of the forward path — method, URL and headers — and the logger
   * to the levels a caller can report a timeout on.
   */
  function proxyArguments(index: number): unknown[] {
    const call = vi.mocked(proxyRequest).mock.calls[index];
    if (!call) throw new Error(`the proxy was called fewer than ${index + 1} times`);

    const [upstreamUrl, forwardPath, forwarded, logger, options] = call;

    return [
      upstreamUrl,
      forwardPath,
      {
        method: forwarded.method,
        url: forwarded.url,
        probe: forwarded.headers.get("x-probe"),
      },
      Object.keys(logger).sort(),
      options,
    ];
  }

  const proxyArgumentCases: Array<
    [name: string, route: RouteRule, request: string, expected: unknown[]]
  > = [
    [
      "a route that strips its matched prefix",
      {
        path: "/api/strip/*",
        methods: [],
        upstream: "http://stripped:3001",
        stripPrefix: true,
        timeoutMs: 1234,
        transform: { setRequestHeaders: { "x-tenant": "acme" } },
      },
      "/api/strip/thing?q=1",
      [
        "http://stripped:3001",
        "/thing",
        { method: "POST", url: "http://localhost/api/strip/thing?q=1", probe: "seen" },
        LOGGER_LEVELS,
        { timeoutMs: 1234, transform: { setRequestHeaders: { "x-tenant": "acme" } } },
      ],
    ],
    [
      "a canary route that keeps the client's path",
      {
        path: "/api/keep/*",
        methods: [],
        upstream: {
          primary: "http://primary:3001",
          canary: "http://canary:3001",
          canaryPercent: 100,
        },
      },
      "/api/keep/thing?q=1",
      [
        "http://canary:3001",
        "/api/keep/thing",
        { method: "POST", url: "http://localhost/api/keep/thing?q=1", probe: "seen" },
        LOGGER_LEVELS,
        { timeoutMs: 30_000, transform: undefined },
      ],
    ],
  ];

  it.each(proxyArgumentCases)(
    "hands the proxy every argument for %s",
    async (_name, route, request, expected) => {
      const { app, shutdown } = createGateway(makeConfig([route]));

      await app.request(request, { method: "POST", headers: { "x-probe": "seen" } });

      expect(vi.mocked(proxyRequest)).toHaveBeenCalledTimes(1);
      expect(proxyArguments(0)).toEqual(expected);
      shutdown();
    },
  );
});

describe("createGateway upstream failure boundary", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.mocked(proxyRequest).mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // The breaker opens once its window holds this many requests and half
  // of them failed, so a run of this length is what separates a status
  // the gateway counts as a failure from one it counts as a success.
  const BREAKER_MINIMUM_REQUESTS = 5;

  // Whether a status counts as an upstream failure is a comparison, so
  // the case that decides it is the boundary itself. 500 is the lowest
  // status an upstream sends to report its own fault; the status below
  // it is still in the client-error range and must not open a circuit.
  const boundaryCases: Array<[status: number, verdict: string, opens: boolean]> = [
    [499, "leaves the circuit closed", false],
    [500, "opens the circuit", true],
    [501, "opens the circuit", true],
  ];

  it.each(boundaryCases)("a run of upstream answers at %i %s", async (status, _verdict, opens) => {
    const fetchMock = stubUpstream(() => new Response("upstream", { status }));
    const { app, shutdown } = createGateway(
      makeConfig([{ path: "/api/boundary/*", methods: [], upstream: "http://boundary:3001" }], {
        logLevel: "error",
      }),
    );

    for (let i = 0; i < BREAKER_MINIMUM_REQUESTS; i++) {
      const answered = await app.request("/api/boundary/thing");
      expect(answered.status).toBe(status);
    }

    const next = await app.request("/api/boundary/thing");

    expect(next.status).toBe(opens ? 503 : status);
    expect(fetchMock).toHaveBeenCalledTimes(
      opens ? BREAKER_MINIMUM_REQUESTS : BREAKER_MINIMUM_REQUESTS + 1,
    );
    shutdown();
  });
});

describe("createGateway client-facing response", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.mocked(proxyRequest).mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the upstream's status, headers and body to the client", async () => {
    stubUpstream(
      () =>
        new Response("upstream payload", {
          status: 207,
          headers: { "x-upstream-marker": "seen", "cache-control": "no-store" },
        }),
    );
    const { app, shutdown } = createGateway(
      makeConfig([{ path: "/api/echo/*", methods: [], upstream: "http://echo:3001" }]),
    );

    const response = await app.request("/api/echo/thing");

    // A status the upstream chose, headers only the upstream could have
    // set, and the upstream's bytes: the three arguments the gateway
    // builds its own Response from.
    expect(response.status).toBe(207);
    expect(response.headers.get("x-upstream-marker")).toBe("seen");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("upstream payload");
    shutdown();
  });
});
