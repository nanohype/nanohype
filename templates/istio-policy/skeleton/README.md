# __PROJECT_NAME__ — Istio policy

Istio service-mesh policy bundle for `__PROJECT_NAME__` in the `__NAMESPACE__` namespace.

## Resources

| File | Kind | Purpose |
|---|---|---|
| `request-authentication.yaml` | `RequestAuthentication` | Tells the sidecar how to decode inbound JWTs — issuer `__OIDC_ISSUER__`, JWKs at `__JWKS_URI__`. |
| `authorization-policy.yaml` | `AuthorizationPolicy` | Requires an authenticated principal from the configured issuer with audience `__ALLOWED_AUD__`. Unauthenticated requests are rejected at the sidecar. |
| `peer-authentication.yaml` | `PeerAuthentication` | STRICT mTLS for all sidecar-to-sidecar traffic in the namespace. Only apply once every workload has a sidecar. |
| `virtual-service.yaml` | `VirtualService` | Routing template for `__SERVICE_HOST__` attached to gateway `__GATEWAY_NAME__`. |

## Apply

```sh
kubectl apply -f .

# optional validation before apply
istioctl analyze .
```

Order matters if you're introducing mTLS to an existing namespace: apply `request-authentication.yaml` and `authorization-policy.yaml` first, confirm auth works, then apply `peer-authentication.yaml` only once every workload is sidecar-injected.

## Selector labels

All four resources select workloads by `app.kubernetes.io/name: __PROJECT_NAME__`. Make sure your Deployment pod template carries that label — `k8s-deploy` sets it by default.

## Defense in depth

Pair this bundle with application-layer JWT validation in the workload (e.g. Spring Security's OAuth 2.0 resource server configured with the same `__OIDC_ISSUER__`). The mesh enforcement catches unauthenticated traffic before it reaches the pod; the app enforcement remains a safety net if the sidecar is bypassed or misconfigured.
