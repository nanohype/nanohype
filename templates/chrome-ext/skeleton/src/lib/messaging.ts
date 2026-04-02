/**
 * Message type definitions for communication between
 * sidepanel, background service worker, and content script.
 */

/** A single chat message in the conversation */
export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/** Chat request payload sent from sidepanel to background */
export interface ChatRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

/** Response from background after processing a chat request */
export interface ChatResponse {
  content: string;
  error?: string;
}

/** Text selection payload sent from content script to background */
export interface SelectionPayload {
  text: string;
  url?: string;
}

/** Union type for all messages flowing through chrome.runtime */
export type ExtensionMessage =
  | { type: "chat"; payload: ChatRequest }
  | { type: "selection"; payload: SelectionPayload };

/**
 * Type-safe wrapper to send a chat message from sidepanel to background.
 */
export function sendChatMessage(
  request: ChatRequest,
): Promise<ChatResponse> {
  return chrome.runtime.sendMessage({
    type: "chat",
    payload: request,
  } satisfies ExtensionMessage);
}

/**
 * Type-safe wrapper to send a text selection from content script to background.
 */
export function sendSelectionMessage(
  text: string,
  url?: string,
): Promise<ChatResponse> {
  return chrome.runtime.sendMessage({
    type: "selection",
    payload: { text, url },
  } satisfies ExtensionMessage);
}
