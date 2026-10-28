import { logger } from "../logger.js";
import type { PaymentProvider } from "../providers/types.js";
import type { BillingWebhookEvent } from "../types.js";

// ── Billing Webhook Router ─────────────────────────────────────────
//
// Verifies an incoming webhook with the payment provider it was built
// with, then dispatches the verified event to the handler registered for
// its type. A request that fails verification reaches no handler.
//
// The provider is passed in rather than looked up by name: verifying
// needs the signing secret and client that init() installed, and the
// registry hands out a fresh, uninitialised instance on every lookup.
// Event types are the provider's own — for Stripe, `invoice.paid`,
// `invoice.payment_failed`, `customer.subscription.created`, and so on.
//

export type WebhookEventHandler = (event: BillingWebhookEvent) => Promise<void>;

export interface BillingWebhookRouter {
  /** Register a handler for a specific event type. */
  on(eventType: string, handler: WebhookEventHandler): void;

  /**
   * Handle an incoming webhook. Verifies the signature with the router's
   * payment provider and dispatches to the matching handler.
   */
  handleBillingWebhook(
    payload: string,
    signature: string,
  ): Promise<{ ok: boolean; event?: BillingWebhookEvent; error?: string }>;
}

/**
 * Create a billing webhook router that verifies with `provider` and
 * dispatches events. `provider` must already be initialised —
 * createBillingService builds its router from the provider it initialised.
 *
 *   const provider = getProvider("stripe");
 *   await provider.init({ provider: "stripe", stripe: { webhookSecret } });
 *   const router = createBillingWebhookRouter(provider);
 *
 *   router.on("invoice.paid", async (event) => {
 *     console.log("Invoice paid:", event.id, event.payload);
 *   });
 *
 *   const result = await router.handleBillingWebhook(rawBody, signature);
 */
export function createBillingWebhookRouter(provider: PaymentProvider): BillingWebhookRouter {
  const handlers = new Map<string, WebhookEventHandler>();

  return {
    on(eventType: string, handler: WebhookEventHandler): void {
      handlers.set(eventType, handler);
    },

    async handleBillingWebhook(
      payload: string,
      signature: string,
    ): Promise<{ ok: boolean; event?: BillingWebhookEvent; error?: string }> {
      let event: BillingWebhookEvent;
      try {
        event = await provider.handleWebhook(payload, signature);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Webhook verification failed", { provider: provider.name, error: message });
        return { ok: false, error: message };
      }

      logger.info("Webhook received", { id: event.id, type: event.type });

      const handler = handlers.get(event.type);
      if (handler) {
        try {
          await handler(event);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error("Webhook handler failed", {
            id: event.id,
            type: event.type,
            error: message,
          });
          return { ok: false, event, error: message };
        }
      }

      return { ok: true, event };
    },
  };
}
