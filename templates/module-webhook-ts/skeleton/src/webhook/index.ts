// ── Module Webhook — Main Exports ────────────────────────────────────
//
// Public API for the webhook module. Import signature providers so
// they self-register, then expose createWebhookReceiver and
// createWebhookSender as the primary entry points.
//

import { validateBootstrap } from "./bootstrap.js";
import "./signatures/index.js";

validateBootstrap();

export type {
  EventDirection,
  EventLogEntry,
  EventStatus,
  ListOptions,
  WebhookEventLog,
} from "./event-log.js";
export { InMemoryEventLog } from "./event-log.js";
export type { WebhookReceiver } from "./receiver.js";
// Re-export everything consumers need
export { createWebhookReceiver } from "./receiver.js";
export type { WebhookEventBody, WebhookSender } from "./sender.js";
export { createWebhookSender } from "./sender.js";
export {
  getSignatureProvider,
  listSignatureProviders,
  registerSignatureProvider,
} from "./signatures/index.js";
export type { SignatureProvider } from "./signatures/types.js";
export type {
  DeliveryOptions,
  DeliveryResult,
  EventHandler,
  EventId,
  HandleResult,
  HandlerMap,
  ReceiverConfig,
  SenderConfig,
  WebhookEvent,
  WebhookPayload,
} from "./types.js";
