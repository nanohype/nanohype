import { getProvider } from "../providers/registry.js";
import { logger } from "../logger.js";
import type { BillingWebhookEvent } from "../types.js";

// ── Billing Webhook Handler ────────────────────────────────────────
//
// Receives incoming billing webhooks, verifies the signature via the
// active payment provider, parses the event, and dispatches to
// registered lifecycle handlers. Supports events like
// subscription.created, invoice.paid, and payment_failed.
//

export type WebhookEventHandler = (event: BillingWebhookEvent) => Promise<void>;

export interface BillingWebhookRouter {
  /** Register a handler for a specific event type. */
  on(eventType: string, handler: WebhookEventHandler): void;

  /**
   * Handle an incoming webhook. Verifies signature via the payment
   * provider and dispatches to the matching handler.
   */
  handleBillingWebhook(
    payload: string,
    signature: string,
  ): Promise<{ ok: boolean; event?: BillingWebhookEvent; error?: string }>;
}

/**
 * Create a billing webhook router that verifies and dispatches events.
 *
 *   const router = createBillingWebhookRouter("stripe");
 *
 *   router.on("invoice.paid", async (event) => {
 *     console.log("Invoice paid:", event.payload);
 *   });
 *
 *   const result = await router.handleBillingWebhook(rawBody, signature);
 */
export function createBillingWebhookRouter(providerName: string): BillingWebhookRouter {
  const handlers = new Map<string, WebhookEventHandler>();

  return {
    on(eventType: string, handler: WebhookEventHandler): void {
      handlers.set(eventType, handler);
    },

    async handleBillingWebhook(
      payload: string,
      signature: string,
    ): Promise<{ ok: boolean; event?: BillingWebhookEvent; error?: string }> {
      const provider = getProvider(providerName);

      let event: BillingWebhookEvent;
      try {
        event = await provider.handleWebhook(payload, signature);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Webhook verification failed", { error: message });
        return { ok: false, error: message };
      }

      logger.info("Webhook received", { type: event.type });

      const handler = handlers.get(event.type);
      if (handler) {
        try {
          await handler(event);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error("Webhook handler failed", { type: event.type, error: message });
          return { ok: false, event, error: message };
        }
      }

      return { ok: true, event };
    },
  };
}
