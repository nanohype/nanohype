import type { Item, ItemCreate, ItemUpdate } from "../domain/types.js";
import { NotFoundError, ConflictError } from "../domain/errors.js";

// ── Item Repository Interface ───────────────────────────────────────
//
// Abstraction over the storage layer. Services depend on this
// interface, not on a concrete database client — making them testable
// without HTTP or a real database.
//

export interface ItemRepository {
  findAll(): Promise<Item[]>;
  findById(id: string): Promise<Item | undefined>;
  create(data: ItemCreate): Promise<Item>;
  update(id: string, data: ItemUpdate): Promise<Item>;
  delete(id: string): Promise<void>;
}

// ── In-Memory Repository ────────────────────────────────────────────
//
// Default implementation backed by a Map. Swap for a database-backed
// repository when persistence is needed.
//

export class InMemoryItemRepository implements ItemRepository {
  private store = new Map<string, Item>();

  async findAll(): Promise<Item[]> {
    return Array.from(this.store.values());
  }

  async findById(id: string): Promise<Item | undefined> {
    return this.store.get(id);
  }

  async create(data: ItemCreate): Promise<Item> {
    const now = new Date().toISOString();
    const item: Item = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.id, item);
    return item;
  }

  async update(id: string, data: ItemUpdate): Promise<Item> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new NotFoundError(`Item ${id} not found`);
    }
    const updated: Item = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) {
      throw new NotFoundError(`Item ${id} not found`);
    }
    this.store.delete(id);
  }
}

// ── Example Service ─────────────────────────────────────────────────
//
// Business logic layer. Framework-agnostic — no Hono, no HTTP
// concepts. Takes a repository via constructor for dependency
// inversion.
//

export class ExampleService {
  constructor(private readonly repository: ItemRepository) {}

  async listItems(): Promise<Item[]> {
    return this.repository.findAll();
  }

  async getItem(id: string): Promise<Item> {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new NotFoundError(`Item ${id} not found`);
    }
    return item;
  }

  async createItem(data: ItemCreate): Promise<Item> {
    return this.repository.create(data);
  }

  async updateItem(id: string, data: ItemUpdate): Promise<Item> {
    return this.repository.update(id, data);
  }

  async deleteItem(id: string): Promise<void> {
    return this.repository.delete(id);
  }
}
