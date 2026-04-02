import { NextRequest } from "next/server";
import { getProvider } from "@/lib/ai/providers";
import { createStreamResponse } from "@/lib/ai/stream";
import { logger } from "@/logger";
import type { ChatMessage } from "@/lib/ai/providers/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      messages: ChatMessage[];
      provider?: string;
      model?: string;
    };

    const { messages, provider: providerName, model } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages array is required" }, { status: 400 });
    }

    const selectedProvider = providerName ?? process.env.LLM_PROVIDER ?? "__LLM_PROVIDER__";
    const aiProvider = getProvider(selectedProvider);

    logger.info("Chat request received", {
      provider: selectedProvider,
      model: model ?? aiProvider.defaultModel,
      messageCount: messages.length,
    });

    return createStreamResponse(aiProvider, messages, model);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    logger.error("Chat endpoint error", { error: message });
    return Response.json({ error: message }, { status: 500 });
  }
}
