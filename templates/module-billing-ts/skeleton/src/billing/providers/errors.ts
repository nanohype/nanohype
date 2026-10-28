// ── Provider Errors ────────────────────────────────────────────────
//
// Errors a payment provider throws that its callers tell apart by type.
//

/**
 * A provider cannot serve a call because of how it is set up rather than
 * because of what the call carries: it is not running (never initialized,
 * or closed), or it holds no credential the call needs, such as a webhook
 * signing secret. The webhook router reports one thrown while verifying a
 * request as `misconfigured`, answered with a 5xx so the payment provider
 * delivers the request again, rather than as `unverified`, which tells the
 * sender the request itself was bad.
 */
export class ProviderConfigError extends Error {
  override name = "ProviderConfigError";
}
