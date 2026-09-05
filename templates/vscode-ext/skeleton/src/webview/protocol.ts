// ── Webview ⇄ extension-host protocol ───────────────────────────────
//
// The webview and the extension host ship in one codebase but run in two
// processes, and `postMessage` carries anything. Nothing type-checks across
// the boundary, so a message the sender emits and the receiver has no case for
// is dropped in silence — the sender looks correct, the receiver looks
// complete, and the feature does nothing.
//
// Both directions are declared here and routed through `handleWebviewMessage`,
// whose default case reports an unrouted message instead of returning. A type
// added on one side and not the other surfaces the first time it is sent.

/** Sent by the webview to the extension host. */
export type InboundMessage =
  | { type: "chat"; payload: string }
  | { type: "info"; payload: string }
  | { type: "error"; payload: string };

/** Sent by the extension host to the webview. */
export type OutboundMessage =
  | { type: "reply"; payload: string }
  | { type: "chatError"; payload: string };

/** Answers a chat turn. Injected so the panel does not resolve credentials. */
export type ChatHandler = (text: string) => Promise<string>;

/** What routing needs from the extension host, named so a test can supply it. */
export interface MessageHandlerDeps {
  chat: ChatHandler;
  post: (message: OutboundMessage) => void;
  showInformationMessage: (text: string) => void;
  showErrorMessage: (text: string) => void;
}

/**
 * Route one message from the webview.
 *
 * A chat turn always answers: the reply on success, `chatError` on failure.
 * The webview holds a pending turn open until one of the two arrives, so a
 * path that returned without posting would leave it waiting forever.
 */
export async function handleWebviewMessage(
  message: { type: string; payload?: unknown },
  deps: MessageHandlerDeps,
): Promise<void> {
  switch (message.type) {
    case "info":
      deps.showInformationMessage(String(message.payload ?? ""));
      return;

    case "error":
      deps.showErrorMessage(String(message.payload ?? ""));
      return;

    case "chat": {
      const text = String(message.payload ?? "");
      try {
        deps.post({ type: "reply", payload: await deps.chat(text) });
      } catch (err) {
        deps.post({
          type: "chatError",
          payload: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    default:
      // Both ends ship together, so a type with no case is a wiring mistake
      // rather than untrusted input. Reporting it is what stops the next one
      // from being discovered by a user whose button does nothing.
      deps.showErrorMessage(`__EXTENSION_NAME__: no handler for webview message '${message.type}'`);
  }
}

/** What the webview should append when a host message arrives, or null. */
export interface AssistantTurn {
  content: string;
  failed: boolean;
}

/**
 * Decide what an inbound host message means to the webview.
 *
 * Split from the component so the webview half of the protocol is testable
 * without a DOM: the component owns rendering, this owns which messages end a
 * pending turn and what they say. `null` means the message is not ours — the
 * webview shares its `message` event with anything else the host posts.
 */
export function assistantTurnFor(data: unknown): AssistantTurn | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, payload } = data as { type?: unknown; payload?: unknown };

  if (type === "reply") return { content: String(payload ?? ""), failed: false };
  if (type === "chatError") {
    return { content: `Request failed: ${String(payload ?? "")}`, failed: true };
  }
  return null;
}
