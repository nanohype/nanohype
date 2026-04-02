import { getSignatureProvider } from "./signatures/index.js";
import type {
  ReceiverConfig,
  WebhookEvent,
  EventHandler,
  HandlerMap,
  HandleResult,
} from "./types.js";

// ── Webhook Receiver ───────────────────────────────────────────────
//
// Receives incoming webhook requests, verifies their signature using
// the configured signature provider, parses the payload into a
// WebhookEvent, and dispatches to registered handlers by event type.
//

export interface WebhookReceiver {
  /** Register a handler for a specific event type. */
  on(eventType: string, handler: EventHandler): void;

  /**
   * Handle an incoming webhook request. Verifies the signature,
   * parses the body, dispatches to the matching handler, and
   * returns the result.
   */
  handleRequest(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<HandleResult>;
}

const RECEIVER_DEFAULTS = {
  signatureMethod: "__SIGNATURE_METHOD__",
  signatureHeader: "x-signature",
  eventHeader: "x-event",
};

/**
 * Create a webhook receiver that verifies signatures and dispatches
 * events to registered handlers.
 *
 *   const receiver = createWebhookReceiver({
 *     secret: process.env.WEBHOOK_SECRET!,
 *   });
 *
 *   receiver.on("push", async (event) => {
 *     console.log("Push event:", event.payload);
 *   });
 *
 *   const result = await receiver.handleRequest(body, headers);
 */
export function createWebhookReceiver(config: ReceiverConfig): WebhookReceiver {
  const signatureMethod = config.signatureMethod ?? RECEIVER_DEFAULTS.signatureMethod;
  const signatureHeader = config.signatureHeader ?? RECEIVER_DEFAULTS.signatureHeader;
  const eventHeader = config.eventHeader ?? RECEIVER_DEFAULTS.eventHeader;
  const handlers: HandlerMap = {};

  return {
    on(eventType: string, handler: EventHandler): void {
      handlers[eventType] = handler;
    },

    async handleRequest(
      rawBody: string,
      headers: Record<string, string | undefined>,
    ): Promise<HandleResult> {
      // Verify signature
      const signature = headers[signatureHeader];

      if (!signature) {
        config.eventLog?.record({
          event: { id: "", event: "unknown", payload: null, timestamp: new Date().toISOString() },
          direction: "received",
          status: "failed",
          attempts: 1,
          error: "Missing signature header",
        });

        return { verified: false, error: "Missing signature header" };
      }

      const provider = getSignatureProvider(signatureMethod);
      const valid = provider.verify(rawBody, signature, config.secret);

      if (!valid) {
        config.eventLog?.record({
          event: { id: "", event: "unknown", payload: null, timestamp: new Date().toISOString() },
          direction: "received",
          status: "failed",
          attempts: 1,
          error: "Invalid signature",
        });

        return { verified: false, error: "Invalid signature" };
      }

      // Parse the payload
      let parsed: { id?: string; event?: string; payload?: unknown };
      try {
        parsed = JSON.parse(rawBody) as { id?: string; event?: string; payload?: unknown };
      } catch {
        config.eventLog?.record({
          event: { id: "", event: "unknown", payload: null, timestamp: new Date().toISOString() },
          direction: "received",
          status: "failed",
          attempts: 1,
          error: "Invalid JSON body",
        });

        return { verified: true, error: "Invalid JSON body" };
      }

      // Build the event — use header for event type if body doesn't contain one
      const eventType = parsed.event ?? headers[eventHeader] ?? "unknown";

      const event: WebhookEvent = {
        id: parsed.id ?? crypto.randomUUID(),
        event: eventType,
        payload: parsed.payload ?? parsed,
        timestamp: new Date().toISOString(),
      };

      // Dispatch to handler
      const handler = handlers[eventType];

      if (handler) {
        try {
          await handler(event);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));

          config.eventLog?.record({
            event,
            direction: "received",
            status: "failed",
            attempts: 1,
            error: error.message,
          });

          return { verified: true, event, error: error.message };
        }
      }

      config.eventLog?.record({
        event,
        direction: "received",
        status: "success",
        attempts: 1,
      });

      return { verified: true, event };
    },
  };
}
