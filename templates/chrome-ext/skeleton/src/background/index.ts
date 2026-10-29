import { sendMessage } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { ChatRequest, ChatResponse, ExtensionMessage } from "@/lib/messaging";
import { getSettings } from "@/lib/storage";
import { validateBootstrap } from "../bootstrap.js";

validateBootstrap();

/**
 * Background service worker for __EXTENSION_NAME__.
 *
 * Responsibilities:
 *   - Listen for messages from sidepanel and content scripts
 *   - Route chat requests to the configured AI provider
 *   - Manage sidepanel lifecycle via chrome.sidePanel API
 */

// Open sidepanel when the extension action (toolbar icon) is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Enable sidepanel on all tabs
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Handle messages from sidepanel and content scripts
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ChatResponse) => void,
  ) => {
    logger.info("background.message", { type: message.type });

    if (message.type === "chat") {
      handleChat(message.payload)
        .then(sendResponse)
        .catch((err) => {
          sendResponse({
            content: "",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        });
      // Return true to indicate async response
      return true;
    }

    if (message.type === "selection" && message.payload?.text) {
      // Handle text selection from content script — wrap it in a chat request
      const selectionRequest: ChatRequest = {
        messages: [
          {
            role: "user",
            content: `Please help me understand the following text:\n\n"${message.payload.text}"`,
          },
        ],
      };
      handleChat(selectionRequest)
        .then(sendResponse)
        .catch((err) => {
          sendResponse({
            content: "",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        });
      return true;
    }
  },
);

async function handleChat(request: ChatRequest): Promise<ChatResponse> {
  const settings = await getSettings();

  if (!settings.endpoint) {
    return {
      content: "",
      error: "No model gateway endpoint is set. Open the extension options to set one.",
    };
  }

  try {
    logger.info("background.chat", { route: settings.route });
    const content = await sendMessage(request.messages, settings);
    return { content };
  } catch (err) {
    logger.error("background.error", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      content: "",
      error: err instanceof Error ? err.message : "Failed to get response",
    };
  }
}
