# api-gateway

API gateway with edge routing, per-route authentication, rate limiting, traffic management, and per-upstream circuit breakers.

## What you get

- Hono-based reverse proxy with path/method route matching
- JWT and API key authentication configurable per route
- Token bucket rate limiting with per-route isolation
- Canary traffic splitting between upstream versions
- Periodic upstream health checking with automatic removal
- Per-upstream circuit breakers (sliding window)
- OpenTelemetry metrics (proxy total, duration, upstream health)
- Zod-validated configuration from environment and routes.json
- Test suite for proxy, matcher, rate limiter, canary, and registry (conditional)

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | -- | Kebab-case project name |
| `Description` | string | `API gateway with routing, auth, and rate limiting` | Project description |
| `Framework` | string | `hono` | HTTP framework |
| `IncludeTests` | bool | `true` | Include test suite |

## Project layout

```text
<ProjectName>/
  src/gateway/
    index.ts                    # createGateway(config) entry point
    types.ts                    # GatewayConfig, RouteRule, UpstreamTarget, ProxyResponse
    config.ts                   # Zod validated config from env + routes.json
    bootstrap.ts                # Placeholder validation
    logger.ts                   # Structured JSON logger
    metrics.ts                  # OTel: gateway_proxy_total, gateway_proxy_duration_ms, gateway_upstream_health
    router/
      proxy.ts                  # Reverse proxy: forward request, stream response
      matcher.ts                # Path/method matching against route rules
      types.ts                  # Router-specific types
    middleware/
      auth.ts                   # JWT/API key validation per route
      rate-limit.ts             # Per-route token bucket rate limiting
      transform.ts              # Request/response header and body transforms
      cors.ts                   # Per-route CORS configuration
    traffic/
      canary.ts                 # Percentage-based traffic splitting
      health.ts                 # Periodic upstream health checking
    resilience/
      circuit-breaker.ts        # Per-upstream circuit breaker
      __tests__/
        circuit-breaker.test.ts # Circuit breaker tests
    __tests__/                  # (optional)
      proxy.test.ts             # Forward request, stream response, error handling
      matcher.test.ts           # Path matching, method filtering, wildcards
      rate-limit.test.ts        # Token bucket exhaustion, recovery, isolation
      canary.test.ts            # Percentage splitting accuracy over N requests
      registry.test.ts          # Route registry lifecycle
```

## Pairs with

- [infra-aws](../infra-aws/) -- deploy to AWS
- [infra-fly](../infra-fly/) -- deploy to Fly.io
- [module-auth-ts](../module-auth-ts/) -- extended auth providers
- [module-rate-limit-ts](../module-rate-limit-ts/) -- pluggable rate limit algorithms
- [module-cache-ts](../module-cache-ts/) -- response caching layer

## Nests inside

- [monorepo](../monorepo/)
