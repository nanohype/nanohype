// -- Filter Expression Types ---------------------------------------------
//
// Composable filter predicates for metadata-based filtering during
// similarity search. Supports comparison operators (eq, ne, gt, lt,
// gte, lte, in) and logical combinators (and, or).
//

/** Comparison filter on a single metadata field. */
export interface ComparisonFilter {
  field: string;
  op: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "in";
  value: unknown;
}

/** Logical AND combinator — all sub-expressions must match. */
export interface AndFilter {
  and: FilterExpression[];
}

/** Logical OR combinator — at least one sub-expression must match. */
export interface OrFilter {
  or: FilterExpression[];
}

/** A filter expression is either a comparison or a logical combinator. */
export type FilterExpression = ComparisonFilter | AndFilter | OrFilter;

/** Returns true if the expression is a comparison filter. */
export function isComparison(expr: FilterExpression): expr is ComparisonFilter {
  return "field" in expr;
}

/** Returns true if the expression is an AND combinator. */
export function isAnd(expr: FilterExpression): expr is AndFilter {
  return "and" in expr;
}

/** Returns true if the expression is an OR combinator. */
export function isOr(expr: FilterExpression): expr is OrFilter {
  return "or" in expr;
}
