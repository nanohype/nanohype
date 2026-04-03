import { describe, it, expect } from "vitest";
import { compileFilter, type SqlFilterResult } from "../filters/compiler.js";
import type { FilterExpression } from "../filters/types.js";

describe("filter compiler", () => {
  // ── SQL backend ──────────────────────────────────────────────────

  describe("sql backend", () => {
    it("compiles eq filter with parameterized output", () => {
      const result = compileFilter({ field: "status", op: "eq", value: "active" }, "sql") as SqlFilterResult;
      expect(result.sql).toBe("metadata->>'status' = $1");
      expect(result.params).toEqual(["active"]);
    });

    it("compiles ne filter with parameterized output", () => {
      const result = compileFilter({ field: "status", op: "ne", value: "deleted" }, "sql") as SqlFilterResult;
      expect(result.sql).toBe("metadata->>'status' != $1");
      expect(result.params).toEqual(["deleted"]);
    });

    it("compiles gt filter with numeric cast", () => {
      const result = compileFilter({ field: "score", op: "gt", value: 0.5 }, "sql") as SqlFilterResult;
      expect(result.sql).toBe("(metadata->>'score')::numeric > $1");
      expect(result.params).toEqual([0.5]);
    });

    it("compiles lt filter with numeric cast", () => {
      const result = compileFilter({ field: "count", op: "lt", value: 100 }, "sql") as SqlFilterResult;
      expect(result.sql).toBe("(metadata->>'count')::numeric < $1");
      expect(result.params).toEqual([100]);
    });

    it("compiles gte filter", () => {
      const result = compileFilter({ field: "priority", op: "gte", value: 3 }, "sql") as SqlFilterResult;
      expect(result.sql).toBe("(metadata->>'priority')::numeric >= $1");
      expect(result.params).toEqual([3]);
    });

    it("compiles lte filter", () => {
      const result = compileFilter({ field: "priority", op: "lte", value: 5 }, "sql") as SqlFilterResult;
      expect(result.sql).toBe("(metadata->>'priority')::numeric <= $1");
      expect(result.params).toEqual([5]);
    });

    it("compiles in filter with multiple params", () => {
      const result = compileFilter(
        { field: "lang", op: "in", value: ["en", "fr"] },
        "sql",
      ) as SqlFilterResult;
      expect(result.sql).toBe("metadata->>'lang' IN ($1, $2)");
      expect(result.params).toEqual(["en", "fr"]);
    });

    it("compiles AND combinator with sequential params", () => {
      const filter: FilterExpression = {
        and: [
          { field: "status", op: "eq", value: "active" },
          { field: "score", op: "gt", value: 0.5 },
        ],
      };
      const result = compileFilter(filter, "sql") as SqlFilterResult;
      expect(result.sql).toBe(
        "(metadata->>'status' = $1 AND (metadata->>'score')::numeric > $2)",
      );
      expect(result.params).toEqual(["active", 0.5]);
    });

    it("compiles OR combinator with sequential params", () => {
      const filter: FilterExpression = {
        or: [
          { field: "source", op: "eq", value: "docs" },
          { field: "source", op: "eq", value: "wiki" },
        ],
      };
      const result = compileFilter(filter, "sql") as SqlFilterResult;
      expect(result.sql).toBe(
        "(metadata->>'source' = $1 OR metadata->>'source' = $2)",
      );
      expect(result.params).toEqual(["docs", "wiki"]);
    });

    it("rejects field names with special characters", () => {
      expect(() =>
        compileFilter({ field: "status'; DROP TABLE--", op: "eq", value: "x" }, "sql"),
      ).toThrow("Invalid field name");
    });
  });

  // ── Qdrant backend ───────────────────────────────────────────────

  describe("qdrant backend", () => {
    it("compiles eq filter", () => {
      const result = compileFilter({ field: "status", op: "eq", value: "active" }, "qdrant");
      expect(result).toEqual({ key: "status", match: { value: "active" } });
    });

    it("compiles ne filter", () => {
      const result = compileFilter({ field: "status", op: "ne", value: "deleted" }, "qdrant");
      expect(result).toEqual({
        must_not: [{ key: "status", match: { value: "deleted" } }],
      });
    });

    it("compiles gt filter as range", () => {
      const result = compileFilter({ field: "score", op: "gt", value: 0.5 }, "qdrant");
      expect(result).toEqual({ key: "score", range: { gt: 0.5 } });
    });

    it("compiles lt filter as range", () => {
      const result = compileFilter({ field: "count", op: "lt", value: 100 }, "qdrant");
      expect(result).toEqual({ key: "count", range: { lt: 100 } });
    });

    it("compiles in filter as match any", () => {
      const result = compileFilter(
        { field: "tag", op: "in", value: ["a", "b"] },
        "qdrant",
      );
      expect(result).toEqual({ key: "tag", match: { any: ["a", "b"] } });
    });

    it("compiles AND combinator as must", () => {
      const filter: FilterExpression = {
        and: [
          { field: "status", op: "eq", value: "active" },
          { field: "score", op: "gt", value: 0.5 },
        ],
      };
      const result = compileFilter(filter, "qdrant");
      expect(result).toEqual({
        must: [
          { key: "status", match: { value: "active" } },
          { key: "score", range: { gt: 0.5 } },
        ],
      });
    });

    it("compiles OR combinator as should", () => {
      const filter: FilterExpression = {
        or: [
          { field: "source", op: "eq", value: "docs" },
          { field: "source", op: "eq", value: "wiki" },
        ],
      };
      const result = compileFilter(filter, "qdrant");
      expect(result).toEqual({
        should: [
          { key: "source", match: { value: "docs" } },
          { key: "source", match: { value: "wiki" } },
        ],
      });
    });
  });

  // ── Pinecone backend ─────────────────────────────────────────────

  describe("pinecone backend", () => {
    it("compiles eq filter", () => {
      const result = compileFilter({ field: "status", op: "eq", value: "active" }, "pinecone");
      expect(result).toEqual({ status: { $eq: "active" } });
    });

    it("compiles ne filter", () => {
      const result = compileFilter({ field: "status", op: "ne", value: "deleted" }, "pinecone");
      expect(result).toEqual({ status: { $ne: "deleted" } });
    });

    it("compiles gt filter", () => {
      const result = compileFilter({ field: "score", op: "gt", value: 0.5 }, "pinecone");
      expect(result).toEqual({ score: { $gt: 0.5 } });
    });

    it("compiles lt filter", () => {
      const result = compileFilter({ field: "count", op: "lt", value: 100 }, "pinecone");
      expect(result).toEqual({ count: { $lt: 100 } });
    });

    it("compiles gte filter", () => {
      const result = compileFilter({ field: "priority", op: "gte", value: 3 }, "pinecone");
      expect(result).toEqual({ priority: { $gte: 3 } });
    });

    it("compiles lte filter", () => {
      const result = compileFilter({ field: "priority", op: "lte", value: 5 }, "pinecone");
      expect(result).toEqual({ priority: { $lte: 5 } });
    });

    it("compiles in filter", () => {
      const result = compileFilter(
        { field: "tag", op: "in", value: ["a", "b"] },
        "pinecone",
      );
      expect(result).toEqual({ tag: { $in: ["a", "b"] } });
    });

    it("compiles AND combinator", () => {
      const filter: FilterExpression = {
        and: [
          { field: "status", op: "eq", value: "active" },
          { field: "score", op: "gt", value: 0.5 },
        ],
      };
      const result = compileFilter(filter, "pinecone");
      expect(result).toEqual({
        $and: [
          { status: { $eq: "active" } },
          { score: { $gt: 0.5 } },
        ],
      });
    });

    it("compiles OR combinator", () => {
      const filter: FilterExpression = {
        or: [
          { field: "source", op: "eq", value: "docs" },
          { field: "source", op: "eq", value: "wiki" },
        ],
      };
      const result = compileFilter(filter, "pinecone");
      expect(result).toEqual({
        $or: [
          { source: { $eq: "docs" } },
          { source: { $eq: "wiki" } },
        ],
      });
    });
  });

  // ── Memory backend ───────────────────────────────────────────────

  describe("memory backend", () => {
    const metadata = { status: "active", score: 0.8, tag: "typescript", count: 42 };

    it("eq matches equal values", () => {
      const predicate = compileFilter(
        { field: "status", op: "eq", value: "active" },
        "memory",
      ) as (m: Record<string, unknown>) => boolean;
      expect(predicate(metadata)).toBe(true);
      expect(predicate({ status: "inactive" })).toBe(false);
    });

    it("ne matches unequal values", () => {
      const predicate = compileFilter(
        { field: "status", op: "ne", value: "deleted" },
        "memory",
      ) as (m: Record<string, unknown>) => boolean;
      expect(predicate(metadata)).toBe(true);
      expect(predicate({ status: "deleted" })).toBe(false);
    });

    it("gt compares numerically", () => {
      const predicate = compileFilter(
        { field: "score", op: "gt", value: 0.5 },
        "memory",
      ) as (m: Record<string, unknown>) => boolean;
      expect(predicate(metadata)).toBe(true);
      expect(predicate({ score: 0.3 })).toBe(false);
    });

    it("lt compares numerically", () => {
      const predicate = compileFilter(
        { field: "count", op: "lt", value: 100 },
        "memory",
      ) as (m: Record<string, unknown>) => boolean;
      expect(predicate(metadata)).toBe(true);
      expect(predicate({ count: 200 })).toBe(false);
    });

    it("in checks set membership", () => {
      const predicate = compileFilter(
        { field: "tag", op: "in", value: ["typescript", "python"] },
        "memory",
      ) as (m: Record<string, unknown>) => boolean;
      expect(predicate(metadata)).toBe(true);
      expect(predicate({ tag: "go" })).toBe(false);
    });

    it("returns false for missing fields", () => {
      const predicate = compileFilter(
        { field: "nonexistent", op: "eq", value: "x" },
        "memory",
      ) as (m: Record<string, unknown>) => boolean;
      expect(predicate(metadata)).toBe(false);
    });

    it("AND requires all conditions", () => {
      const predicate = compileFilter(
        {
          and: [
            { field: "status", op: "eq", value: "active" },
            { field: "score", op: "gt", value: 0.5 },
          ],
        },
        "memory",
      ) as (m: Record<string, unknown>) => boolean;
      expect(predicate(metadata)).toBe(true);
      expect(predicate({ status: "active", score: 0.3 })).toBe(false);
    });

    it("OR requires at least one condition", () => {
      const predicate = compileFilter(
        {
          or: [
            { field: "status", op: "eq", value: "active" },
            { field: "status", op: "eq", value: "pending" },
          ],
        },
        "memory",
      ) as (m: Record<string, unknown>) => boolean;
      expect(predicate(metadata)).toBe(true);
      expect(predicate({ status: "deleted" })).toBe(false);
    });
  });
});
