import type { AiProvider } from "./providers/types.js";
import type { ChatMessage } from "./providers/types.js";

/**
 * Creates a streaming HTTP response from an AI provider.
 *
 * Converts the provider's async iterable of text chunks into a
 * ReadableStream suitable for returning from a Next.js route handler.
 */
export function createStreamResponse(
  provider: AiProvider,
  messages: ChatMessage[],
  model?: string
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of provider.streamMessage(messages, model)) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
