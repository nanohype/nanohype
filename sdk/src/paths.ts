import { isAbsolute, resolve, sep } from "node:path";
import { NanohypeError } from "./errors.js";

/**
 * Path containment — the one place that decides whether a caller-influenced
 * path may reach the filesystem.
 *
 * Two boundaries need the decision and they need it in different shapes. A
 * catalog name arrives from the outside and is resolved against a directory
 * this process owns, so the question is whether the resolved path stays under
 * that directory: `resolveWithin` answers it. A rendered file path is produced
 * here and handed to a caller who supplies the directory later, so there is no
 * base to resolve against at the moment the path is built; the question is
 * whether the path is still relative and descending: `assertDescendingPath`
 * answers that one.
 *
 * Both live here rather than beside either caller because a second
 * implementation of containment is a second thing to get right. The `escapes`
 * and `null byte` wording is load-bearing — callers and their tests match on
 * it to tell a refusal from a missing file.
 */

/** Reject a segment carrying a NUL, which truncates the path at the syscall. */
function assertNoNullByte(value: string, what: string): void {
  if (value.includes("\0")) {
    throw new NanohypeError(`${what}: contains a null byte`);
  }
}

/**
 * Resolve caller-influenced segments against a base directory and assert the
 * result stays inside it. Names ultimately arrive from LLM tool arguments, so
 * a crafted `../`, absolute, or null-byte segment must never resolve to a file
 * outside the base.
 */
export function resolveWithin(baseDir: string, ...segments: string[]): string {
  for (const segment of segments) {
    assertNoNullByte(segment, "Invalid path segment");
  }
  const base = resolve(baseDir);
  const resolved = resolve(base, ...segments);
  if (resolved !== base && !resolved.startsWith(base + sep)) {
    throw new NanohypeError(`Path '${segments.join("/")}' escapes '${base}'`);
  }
  return resolved;
}

/**
 * Raised when a rendered path would leave the tree it belongs to. Distinct
 * from a render failure: a template that cannot be fetched or rendered is one
 * entry's problem, while a path that escapes is a refusal the caller must see
 * rather than a degraded result it can carry on from.
 */
export class PathContainmentError extends NanohypeError {
  constructor(message: string) {
    super(message);
    this.name = "PathContainmentError";
  }
}

/**
 * Assert a rendered path is still relative and descending — no absolute root,
 * no drive letter, no `..` segment, no NUL, not empty.
 *
 * Placeholder substitution is what breaks this. A skeleton declares
 * `addons/__CATEGORY__/values.yaml`, which is relative and descending; a
 * variable value of `../../elsewhere` turns it into a path that `join` takes
 * back out of the output directory. The check runs against the path alone, so
 * it holds wherever the path was produced and whatever directory the caller
 * eventually joins it to.
 *
 * A `..` segment is refused even where it would normalize back inside, because
 * no skeleton path needs one and a rendered path that grew one is a substituted
 * value doing something the template did not ask for.
 */
export function assertDescendingPath(path: string, what: string): void {
  assertNoNullByte(path, what);
  if (path === "") {
    throw new PathContainmentError(`${what} is empty`);
  }
  if (isAbsolute(path) || /^[a-zA-Z]:/.test(path) || path.startsWith("\\")) {
    throw new PathContainmentError(`${what} '${path}' escapes the render root: it is absolute`);
  }
  // Both separators, because a value substituted into a path is not obliged to
  // use the one the skeleton was written with.
  if (path.split(/[/\\]/).includes("..")) {
    throw new PathContainmentError(
      `${what} '${path}' escapes the render root: it contains a '..' segment`,
    );
  }
}
