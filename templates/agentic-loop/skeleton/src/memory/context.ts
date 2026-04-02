import type { Message } from "../providers/index.js";
import { countTokens } from "../tokens.js";
import { MessageStore } from "./store.js";

/**
 * Default token budgets. These are conservative estimates that leave
 * headroom for the model's response.
 */
const DEFAULT_MAX_CONTEXT_TOKENS = 100_000;
const DEFAULT_SYSTEM_PROMPT_TOKENS = 2_000;
const DEFAULT_RESPONSE_RESERVE_TOKENS = 4_096;

export interface ContextConfig {
  /** Maximum total context window tokens. */
  maxContextTokens?: number;

  /** Estimated tokens reserved for the system prompt. */
  systemPromptTokens?: number;

  /** Tokens reserved for the model's response. */
  responseReserveTokens?: number;
}

/**
 * Context window manager. Assembles the system prompt, conversation
 * history from the message store, and current user input into a set
 * of messages that fits within the model's context window.
 */
export class ContextManager {
  private store: MessageStore;
  private maxContextTokens: number;
  private systemPromptTokens: number;
  private responseReserveTokens: number;

  constructor(store: MessageStore, config: ContextConfig = {}) {
    this.store = store;
    this.maxContextTokens = config.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
    this.systemPromptTokens = config.systemPromptTokens ?? DEFAULT_SYSTEM_PROMPT_TOKENS;
    this.responseReserveTokens =
      config.responseReserveTokens ?? DEFAULT_RESPONSE_RESERVE_TOKENS;
  }

  /**
   * Calculate the token budget available for conversation history.
   */
  private get historyBudget(): number {
    return (
      this.maxContextTokens -
      this.systemPromptTokens -
      this.responseReserveTokens
    );
  }

  /**
   * Assemble messages for an LLM call. Truncates conversation history
   * if necessary to fit within the context window.
   */
  assembleMessages(currentInput: string): {
    messages: Message[];
  } {
    // Count tokens for the current input using tiktoken
    const inputTokens = countTokens(currentInput);
    const availableForHistory = this.historyBudget - inputTokens;

    // Truncate stored history to fit
    if (availableForHistory > 0) {
      this.store.truncateToTokenBudget(availableForHistory);
    }

    // Build the message list: history + current input
    const messages: Message[] = [
      ...this.store.getAll(),
      { role: "user" as const, content: currentInput },
    ];

    return { messages };
  }

  /** Get the underlying message store. */
  getStore(): MessageStore {
    return this.store;
  }
}
