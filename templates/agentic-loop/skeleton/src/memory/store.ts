import type { Message } from "../providers/index.js";
import { countTokens } from "../tokens.js";

/**
 * Extract the text content from a message and count its tokens using
 * tiktoken's BPE tokenizer (cl100k_base).
 */
function messageTokens(message: Message): number {
  let text: string;
  if (typeof message.content === "string") {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    text = message.content
      .map((block) => {
        if ("text" in block && block.text) return block.text;
        if ("content" in block && block.content) return block.content;
        if ("input" in block && block.input) return JSON.stringify(block.input);
        return "";
      })
      .join(" ");
  } else {
    text = "";
  }

  return countTokens(text);
}

/**
 * Conversation message store. Maintains an ordered list of messages
 * with token-aware truncation.
 */
export class MessageStore {
  private messages: Message[] = [];

  /** Add a message to the store. */
  add(message: Message): void {
    this.messages.push(message);
  }

  /** Add multiple messages to the store. */
  addAll(messages: Message[]): void {
    this.messages.push(...messages);
  }

  /** Get all messages. Returns a shallow copy. */
  getAll(): Message[] {
    return [...this.messages];
  }

  /** Get the most recent N messages. */
  getRecent(count: number): Message[] {
    return this.messages.slice(-count);
  }

  /** Get the number of stored messages. */
  get length(): number {
    return this.messages.length;
  }

  /** Clear all messages. */
  clear(): void {
    this.messages = [];
  }

  /**
   * Estimate the total token count of all stored messages.
   */
  estimateTotalTokens(): number {
    return this.messages.reduce((sum, msg) => sum + messageTokens(msg), 0);
  }

  /**
   * Truncate the store to fit within a token budget. Removes the
   * oldest messages first, preserving the most recent conversation
   * context. Always keeps at least the most recent message.
   */
  truncateToTokenBudget(maxTokens: number): void {
    if (this.messages.length <= 1) return;

    let totalTokens = this.estimateTotalTokens();

    while (totalTokens > maxTokens && this.messages.length > 1) {
      const removed = this.messages.shift()!;
      totalTokens -= messageTokens(removed);
    }
  }
}
