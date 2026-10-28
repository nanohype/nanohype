import type { SubscriptionStatus } from "./types.js";

// ── Subscription Entitlement ───────────────────────────────────────
//
// The one place that decides whether a subscription status grants access
// to the plan. Access checks, webhook handlers, and anything else that
// gates a feature on a subscription read it from here rather than comparing
// against "active", so `trialing` is never forgotten and `unpaid` or
// `past_due` is never let through.
//

const ENTITLED: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  "active",
  "trialing",
]);

/**
 * True when a subscription in this status entitles its customer to the plan:
 * `active` or `trialing`, and nothing else.
 *
 *   billing.onWebhook("customer.subscription.updated", async (event) => {
 *     const subscription = event.payload as { id: string; status: SubscriptionStatus };
 *     await setAccess(subscription.id, isEntitled(subscription.status));
 *   });
 */
export function isEntitled(status: SubscriptionStatus): boolean {
  return ENTITLED.has(status);
}
