import type { Message } from "../providers/index.js";

/**
 * Persistence interface for saving and loading conversations. Implementations
 * can back this with any storage — in-memory, filesystem, SQLite, Redis, etc.
 */
export interface ConversationStore {
  /** Save (or overwrite) a conversation's message history. */
  save(conversationId: string, messages: Message[]): Promise<void>;

  /** Load a previously saved conversation. Returns null if not found. */
  load(conversationId: string): Promise<Message[] | null>;

  /** List all saved conversation IDs. */
  list(): Promise<string[]>;
}

/**
 * In-memory implementation of ConversationStore. Useful for development,
 * testing, and single-process CLIs where persistence across restarts is
 * not required.
 */
export class InMemoryConversationStore implements ConversationStore {
  private conversations = new Map<string, Message[]>();

  async save(conversationId: string, messages: Message[]): Promise<void> {
    // Deep-copy so external mutations don't affect the stored data
    this.conversations.set(conversationId, structuredClone(messages));
  }

  async load(conversationId: string): Promise<Message[] | null> {
    const stored = this.conversations.get(conversationId);
    if (!stored) return null;
    return structuredClone(stored);
  }

  async list(): Promise<string[]> {
    return [...this.conversations.keys()];
  }
}
