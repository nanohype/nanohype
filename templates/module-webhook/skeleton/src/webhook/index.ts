// ── Module Webhook — Main Exports ────────────────────────────────────
//
// Public API for the webhook module. Import signature providers so
// they self-register, then expose createWebhookReceiver and
// createWebhookSender as the primary entry points.
//

import { validateBootstrap } from "./bootstrap.js";
import "./signatures/index.js";

validateBootstrap();

// Re-export everything consumers need
export { createWebhookReceiver } from "./receiver.js";
export { createWebhookSender } from "./sender.js";
export { InMemoryEventLog } from "./event-log.js";
export {
  getSignatureProvider,
  listSignatureProviders,
  registerSignatureProvider,
} from "./signatures/index.js";
export type { SignatureProvider } from "./signatures/types.js";
export type { WebhookReceiver } from "./receiver.js";
export type { WebhookSender, WebhookEventBody } from "./sender.js";
export type {
  WebhookEventLog,
  EventLogEntry,
  EventDirection,
  EventStatus,
  ListOptions,
} from "./event-log.js";
export type {
  EventId,
  WebhookEvent,
  WebhookPayload,
  DeliveryResult,
  DeliveryOptions,
  ReceiverConfig,
  SenderConfig,
  EventHandler,
  HandlerMap,
  HandleResult,
} from "./types.js";
