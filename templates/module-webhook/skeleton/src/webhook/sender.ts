import { getSignatureProvider } from "./signatures/index.js";
import type { SenderConfig, DeliveryResult, DeliveryOptions, WebhookEvent } from "./types.js";

// ── Webhook Sender ─────────────────────────────────────────────────
//
// Sends webhook POST requests with automatic signature generation
// and exponential backoff retry on 5xx or network errors. Gives up
// after maxRetries attempts.
//

export interface WebhookSender {
  /**
   * Send a webhook event to the given URL. Signs the payload,
   * retries on transient failures, and returns the delivery result.
   */
  send(url: string, body: WebhookEventBody, opts?: DeliveryOptions): Promise<DeliveryResult>;
}

/** Body shape for outgoing webhook events. */
export interface WebhookEventBody {
  /** Event type identifier. */
  event: string;

  /** Arbitrary payload to deliver. */
  payload: unknown;

  /** Optional caller-supplied event ID. */
  id?: string;
}

const SENDER_DEFAULTS = {
  signatureMethod: "__SIGNATURE_METHOD__",
  signatureHeader: "x-signature",
  maxRetries: 3,
  baseDelay: 1000,
};

/**
 * Create a webhook sender that signs payloads and retries on failure.
 *
 *   const sender = createWebhookSender({
 *     secret: process.env.WEBHOOK_SECRET!,
 *   });
 *
 *   const result = await sender.send("https://example.com/hook", {
 *     event: "deploy.completed",
 *     payload: { version: "1.2.0" },
 *   });
 */
export function createWebhookSender(config: SenderConfig): WebhookSender {
  const signatureMethod = config.signatureMethod ?? SENDER_DEFAULTS.signatureMethod;
  const signatureHeader = config.signatureHeader ?? SENDER_DEFAULTS.signatureHeader;
  const defaultMaxRetries = config.maxRetries ?? SENDER_DEFAULTS.maxRetries;
  const defaultBaseDelay = config.baseDelay ?? SENDER_DEFAULTS.baseDelay;

  return {
    async send(
      url: string,
      body: WebhookEventBody,
      opts?: DeliveryOptions,
    ): Promise<DeliveryResult> {
      const maxRetries = opts?.maxRetries ?? defaultMaxRetries;
      const baseDelay = opts?.baseDelay ?? defaultBaseDelay;

      // Build the full event payload
      const event: WebhookEvent = {
        id: body.id ?? crypto.randomUUID(),
        event: body.event,
        payload: body.payload,
        timestamp: new Date().toISOString(),
      };

      const rawBody = JSON.stringify(event);

      // Sign the payload
      const provider = getSignatureProvider(signatureMethod);
      const signature = provider.sign(rawBody, config.secret);

      let lastStatusCode = 0;
      let lastError: string | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Exponential backoff with jitter on retries
        if (attempt > 0) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          const jitter = Math.random() * delay * 0.5;
          await sleep(delay + jitter);
        }

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [signatureHeader]: signature,
              ...opts?.headers,
            },
            body: rawBody,
          });

          lastStatusCode = response.status;

          if (response.ok) {
            config.eventLog?.record({
              event,
              direction: "sent",
              status: "success",
              attempts: attempt + 1,
            });

            return { ok: true, statusCode: response.status, attempts: attempt + 1 };
          }

          // Only retry on 5xx server errors
          if (response.status < 500) {
            lastError = `HTTP ${response.status}`;

            config.eventLog?.record({
              event,
              direction: "sent",
              status: "failed",
              attempts: attempt + 1,
              error: lastError,
            });

            return {
              ok: false,
              statusCode: response.status,
              attempts: attempt + 1,
              error: lastError,
            };
          }

          // 5xx — will retry if attempts remain
          lastError = `HTTP ${response.status}`;
        } catch (err) {
          // Network error — will retry if attempts remain
          lastStatusCode = 0;
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      // Exhausted all retries
      config.eventLog?.record({
        event,
        direction: "sent",
        status: "failed",
        attempts: maxRetries + 1,
        error: lastError,
      });

      return {
        ok: false,
        statusCode: lastStatusCode,
        attempts: maxRetries + 1,
        error: lastError,
      };
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
