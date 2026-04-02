// ── Domain Types ────────────────────────────────────────────────────
//
// Pure domain entity types. These describe the shape of business
// objects — not HTTP requests, not database rows. Routes and services
// both reference these types.
//

export interface Item {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemCreate {
  name: string;
  description?: string;
}

export interface ItemUpdate {
  name?: string;
  description?: string;
}

export interface ItemQuery {
  limit?: number;
  offset?: number;
}
