//
// exclusions.mjs — reading a `coverage.exclude` array, and reading which
// comment argues for which entry in it.
//
// The second is the part that was missing. A justification is a sentence about
// particular files, and a check that scans every comment in a config against
// every filename in a skeleton is answering a different question — whether the
// two vocabularies overlap anywhere. They overlap in configs that exclude
// nothing.
//

import _ts from "typescript";

// TypeScript ships CommonJS; the ESM shim exposes the API as the default.
const ts = _ts.default ?? _ts;

// A claim that some other suite covers the excluded files. `integration` was
// the wording that shipped; the others are the same argument in different
// words, and a matcher that caught only the first is a gate anyone steps around
// by rephrasing.
//
// Each word is tracked on its own. A comment citing an e2e suite is not
// discharged by a smoke test: the comment names a suite, and the suite it names
// is the one that has to run.
export const SUITE_WORDS = ["integration", "e2e", "end-to-end", "smoke", "acceptance"];

export const TEST_FILE = /\.(test|spec)\.tsx?$/;

/**
 * The names a path spells, at every granularity a name is written at.
 *
 * A directory is one name, a filename is another once its extension is off, and
 * the parts either is built from are more. All three are offered, because a
 * suite is as often a directory (`integration/queue.test.ts`) as an infix
 * (`pipeline.integration.test.ts`), and a matcher holding only the second calls
 * a genuine suite missing and tells the author to write the one already there.
 */
export function pathTerms(relPath) {
  const terms = new Set();
  for (const segment of relPath.toLowerCase().split("/")) {
    if (!segment) continue;
    // Every suffix off, one at a time, so a name spelled across dots offers
    // itself whole at each depth: `end-to-end.test.ts` is a suite named
    // `end-to-end`, and a single strip only ever reaches `end-to-end.test`.
    let stem = segment;
    while (stem) {
      terms.add(stem);
      for (const part of stem.split(/[-_.]/)) if (part) terms.add(part);
      const shorter = stem.replace(/\.[^.]+$/, "");
      if (shorter === stem) break;
      stem = shorter;
    }
  }
  return terms;
}

/** The test files in a skeleton that belong to the suite a comment names. */
export function suiteFilesFor(word, files) {
  return files.filter((file) => TEST_FILE.test(file) && pathTerms(file).has(word));
}

/** The `exclude` property assignment whose initializer is an array literal. */
function excludeProperty(parsed) {
  let found = null;
  const visit = (node) => {
    if (
      !found &&
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) &&
      node.name.text === "exclude" &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/**
 * The entries of `coverage.exclude`, read from the parse.
 *
 * A quote style is not a claim about anything. A regex over the source answers
 * which quote characters its author expected, so an entry written with
 * backticks drops out of the gate's view while still excluding the file — the
 * exclusion goes on working and the check stops seeing it.
 *
 * An element that is not a literal string is returned as `null`, so the caller
 * can refuse a config it cannot read rather than silently checking fewer
 * exclusions than the config has.
 */
export function excludeEntries(source, fileName = "vitest.config.ts") {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const prop = excludeProperty(parsed);
  if (!prop) return [];
  return prop.initializer.elements.map((element) =>
    ts.isStringLiteralLike(element) ? element.text : null,
  );
}

/**
 * Every comment citing a suite, with the exclusion entries it argues for.
 *
 * Attribution is by position, which is how a reader attributes one:
 *
 *   - a comment inside the array, on the same line as an entry that ends before
 *     it, trails that entry and argues for it alone;
 *   - a comment inside the array otherwise leads the run of entries that follow
 *     it, up to the next leading comment. A rationale written above a group is
 *     about the group, which is how these are written and how they read;
 *   - a comment in the trivia before `exclude:` argues for whatever no leading
 *     comment inside the array has already claimed — the whole array when there
 *     are none, which is where both of the catalog's rationales sat;
 *   - a comment anywhere else argues for no entry, and this reports none. A
 *     config that excludes nothing has no entry for a sentence to be about, and
 *     a check that failed one on a stray comment was reading the file, not the
 *     decision.
 *
 * Comments come from the token stream rather than from node trivia: a comment
 * after the last element of an array — exactly where a rationale for the last
 * exclusion sits — is no node's leading or trailing trivia. A block comment and
 * a comment trailing a line of code make the same argument as a line comment,
 * so a reader seeing only whole-line comments is stepped around by moving the
 * sentence. A suite word inside a string is a glob, not a claim, and the
 * scanner does not report strings.
 */
export function citedClaims(source, fileName = "vitest.config.ts") {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const prop = excludeProperty(parsed);
  if (!prop) return [];

  const array = prop.initializer;
  const elements = array.elements.map((element) => ({
    entry: ts.isStringLiteralLike(element) ? element.text : null,
    start: element.getStart(parsed),
    end: element.getEnd(),
  }));
  if (elements.length === 0) return [];

  const arrayStart = array.getStart(parsed);
  const arrayEnd = array.getEnd();
  const propStart = prop.getStart(parsed);
  const propFullStart = prop.getFullStart();

  const lineOf = (position) => parsed.getLineAndCharacterOfPosition(position).line;

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.Standard,
    source,
  );

  // Every comment, cited or not, because a comment that cites no suite still
  // ends the run of entries the comment above it argues for.
  const comments = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }
    const start = scanner.getTokenStart();
    const end = scanner.getTokenEnd();
    const text = scanner.getTokenText();
    const inArray = start >= arrayStart && end <= arrayEnd;
    const aboveProperty = start >= propFullStart && end <= propStart;
    if (!inArray && !aboveProperty) continue;
    const trails =
      inArray && elements.some((e) => e.end <= start && lineOf(e.end) === lineOf(start));
    const single = token === ts.SyntaxKind.SingleLineCommentTrivia;

    // A rationale is a paragraph, and a paragraph written with `//` is several
    // comments to a scanner. Consecutive line comments are joined back into the
    // one block they read as: otherwise the entries below a three-line
    // rationale belong to its first line, and a claim made on the third line
    // argues for nothing.
    const previous = comments[comments.length - 1];
    if (
      previous?.single &&
      single &&
      !previous.trails &&
      !trails &&
      previous.inArray === inArray &&
      previous.aboveProperty === aboveProperty &&
      lineOf(start) === lineOf(previous.end) + 1
    ) {
      previous.end = end;
      previous.text += `\n${text}`;
      continue;
    }

    comments.push({ start, end, text, inArray, aboveProperty, trails, single });
  }

  const owned = new Map(comments.map((c) => [c, []]));

  for (const element of elements) {
    if (element.entry === null) continue;

    const trailing = comments.find(
      (c) => c.trails && c.start >= element.end && lineOf(c.start) === lineOf(element.end),
    );
    if (trailing) {
      owned.get(trailing).push(element);
      continue;
    }

    // The run this entry belongs to: the last leading comment inside the array
    // before it. With none, the rationale above `exclude:` is what argues for
    // it, and with neither the entry carries no claim at all.
    const leading = comments.filter((c) => c.inArray && !c.trails && c.end <= element.start).pop();
    const owner = leading ?? comments.find((c) => c.aboveProperty);
    if (owner) owned.get(owner).push(element);
  }

  const claims = [];
  for (const comment of comments) {
    const words = SUITE_WORDS.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(comment.text));
    if (words.length === 0) continue;
    const entries = owned.get(comment);
    if (entries.length === 0) continue;
    const line = lineOf(comment.start) + 1;
    const shown = comment.text.split("\n")[0].trim();
    for (const word of words) {
      claims.push({ word, line, comment: shown, entries: entries.map((e) => e.entry) });
    }
  }

  return claims;
}
