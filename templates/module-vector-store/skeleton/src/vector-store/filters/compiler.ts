// -- Filter Compiler -----------------------------------------------------
//
// Translates a FilterExpression into a backend-native query format.
// Supports four compilation targets:
//
//   - "sql"      → SQL WHERE clause string (for pgvector)
//   - "qdrant"   → Qdrant filter object
//   - "pinecone" → Pinecone metadata filter object
//   - "memory"   → Predicate function for in-memory evaluation
//

import type { FilterExpression, ComparisonFilter } from "./types.js";
import { isComparison, isAnd, isOr } from "./types.js";

export type FilterBackend = "sql" | "qdrant" | "pinecone" | "memory";

// ── SQL (pgvector) ────────────────────────────────────────────────

const SQL_OPS: Record<string, string> = {
  eq: "=",
  ne: "!=",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
};

/** Parameterized SQL output: a fragment with $N placeholders and a matching params array. */
export interface SqlFilterResult {
  sql: string;
  params: unknown[];
}

const SAFE_FIELD_RE = /^[a-zA-Z0-9_]+$/;

/**
 * Sanitize a field name to prevent SQL injection.
 * Only alphanumeric characters and underscores are allowed.
 */
function sanitizeField(field: string): string {
  if (!SAFE_FIELD_RE.test(field)) {
    throw new Error(`Invalid field name: "${field}" — only [a-zA-Z0-9_] allowed`);
  }
  return field;
}

/**
 * Compile a filter expression to a parameterized SQL WHERE clause fragment.
 * Uses JSONB operators against a `metadata` column. Values are bound via
 * $N parameter placeholders to prevent SQL injection.
 */
function compileToSql(expr: FilterExpression, params: unknown[] = []): SqlFilterResult {
  if (isComparison(expr)) {
    return compileComparisonToSql(expr, params);
  }
  if (isAnd(expr)) {
    const parts = expr.and.map((e) => compileToSql(e, params));
    return { sql: `(${parts.map((p) => p.sql).join(" AND ")})`, params };
  }
  if (isOr(expr)) {
    const parts = expr.or.map((e) => compileToSql(e, params));
    return { sql: `(${parts.map((p) => p.sql).join(" OR ")})`, params };
  }
  throw new Error("Unknown filter expression type");
}

function compileComparisonToSql(filter: ComparisonFilter, params: unknown[]): SqlFilterResult {
  const { field, op, value } = filter;
  const safeField = sanitizeField(field);
  const jsonPath = `metadata->>'${safeField}'`;

  if (op === "in") {
    if (!Array.isArray(value)) throw new Error(`"in" operator requires an array value`);
    const placeholders = value.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    return { sql: `${jsonPath} IN (${placeholders.join(", ")})`, params };
  }

  const sqlOp = SQL_OPS[op];
  if (!sqlOp) throw new Error(`Unsupported SQL operator: ${op}`);

  params.push(value);
  const placeholder = `$${params.length}`;

  if (typeof value === "number") {
    return { sql: `(${jsonPath})::numeric ${sqlOp} ${placeholder}`, params };
  }

  return { sql: `${jsonPath} ${sqlOp} ${placeholder}`, params };
}

// ── Qdrant ────────────────────────────────────────────────────────

const QDRANT_OPS: Record<string, string> = {
  eq: "match",
  gt: "gt",
  lt: "lt",
  gte: "gte",
  lte: "lte",
};

function compileToQdrant(expr: FilterExpression): Record<string, unknown> {
  if (isComparison(expr)) {
    return compileComparisonToQdrant(expr);
  }
  if (isAnd(expr)) {
    return { must: expr.and.map(compileToQdrant) };
  }
  if (isOr(expr)) {
    return { should: expr.or.map(compileToQdrant) };
  }
  throw new Error("Unknown filter expression type");
}

function compileComparisonToQdrant(filter: ComparisonFilter): Record<string, unknown> {
  const { field, op, value } = filter;

  if (op === "eq") {
    return { key: field, match: { value } };
  }
  if (op === "ne") {
    return { must_not: [{ key: field, match: { value } }] };
  }
  if (op === "in") {
    if (!Array.isArray(value)) throw new Error(`"in" operator requires an array value`);
    return { key: field, match: { any: value } };
  }

  const qdrantOp = QDRANT_OPS[op];
  if (!qdrantOp) throw new Error(`Unsupported Qdrant operator: ${op}`);
  return { key: field, range: { [qdrantOp]: value } };
}

// ── Pinecone ──────────────────────────────────────────────────────

const PINECONE_OPS: Record<string, string> = {
  eq: "$eq",
  ne: "$ne",
  gt: "$gt",
  lt: "$lt",
  gte: "$gte",
  lte: "$lte",
  in: "$in",
};

function compileToPinecone(expr: FilterExpression): Record<string, unknown> {
  if (isComparison(expr)) {
    return compileComparisonToPinecone(expr);
  }
  if (isAnd(expr)) {
    return { $and: expr.and.map(compileToPinecone) };
  }
  if (isOr(expr)) {
    return { $or: expr.or.map(compileToPinecone) };
  }
  throw new Error("Unknown filter expression type");
}

function compileComparisonToPinecone(filter: ComparisonFilter): Record<string, unknown> {
  const { field, op, value } = filter;
  const pineconeOp = PINECONE_OPS[op];
  if (!pineconeOp) throw new Error(`Unsupported Pinecone operator: ${op}`);
  return { [field]: { [pineconeOp]: value } };
}

// ── Memory (predicate function) ───────────────────────────────────

function compileToMemory(expr: FilterExpression): (metadata: Record<string, unknown>) => boolean {
  if (isComparison(expr)) {
    return compileComparisonToMemory(expr);
  }
  if (isAnd(expr)) {
    const predicates = expr.and.map(compileToMemory);
    return (metadata) => predicates.every((p) => p(metadata));
  }
  if (isOr(expr)) {
    const predicates = expr.or.map(compileToMemory);
    return (metadata) => predicates.some((p) => p(metadata));
  }
  throw new Error("Unknown filter expression type");
}

function compileComparisonToMemory(
  filter: ComparisonFilter,
): (metadata: Record<string, unknown>) => boolean {
  const { field, op, value } = filter;

  return (metadata) => {
    const actual = metadata[field];
    if (actual === undefined) return false;

    switch (op) {
      case "eq":
        return actual === value;
      case "ne":
        return actual !== value;
      case "gt":
        return (actual as number) > (value as number);
      case "lt":
        return (actual as number) < (value as number);
      case "gte":
        return (actual as number) >= (value as number);
      case "lte":
        return (actual as number) <= (value as number);
      case "in":
        return Array.isArray(value) && value.includes(actual);
      default:
        return false;
    }
  };
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Compile a filter expression into a backend-specific format.
 *
 * @param filter   The filter expression to compile.
 * @param backend  Target backend: "sql", "qdrant", "pinecone", or "memory".
 * @returns        Backend-native filter representation.
 */
export function compileFilter(
  filter: FilterExpression,
  backend: FilterBackend,
): SqlFilterResult | Record<string, unknown> | ((metadata: Record<string, unknown>) => boolean) {
  switch (backend) {
    case "sql":
      return compileToSql(filter);
    case "qdrant":
      return compileToQdrant(filter);
    case "pinecone":
      return compileToPinecone(filter);
    case "memory":
      return compileToMemory(filter);
    default:
      throw new Error(`Unknown filter backend: ${backend}`);
  }
}
