/**
 * Boolean conditions for template rendering.
 *
 * Conditions appear in two places, both sharing one tiny boolean grammar over
 * variable names:
 *   - manifest `conditionals[].when` — file-level inclusion
 *   - inline `#if <expr> ... #endif` comment markers — content-level inclusion
 *
 *   expr  := or
 *   or    := and ('||' and)*
 *   and   := unary ('&&' unary)*
 *   unary := '!' unary | primary
 *   prim  := '(' expr ')' | IDENT
 *
 * A variable is truthy unless its resolved value is '', 'false', or '0' (or it
 * is unset). Bool variables resolve to 'true' / 'false', so the common single
 * name case (`when: IncludeVpc`) behaves as expected, and richer dependencies
 * such as `IncludeVpc || IncludeRds` are expressible.
 */

import { TemplateRenderError } from './errors.js';

const FALSY = new Set(['', 'false', '0']);

function isTruthy(value: string | undefined): boolean {
  return value !== undefined && !FALSY.has(value);
}

/** Evaluate a boolean expression over resolved variable values. */
export function evalCondition(expr: string, resolved: Record<string, string>): boolean {
  const tokens = expr.match(/\|\||&&|!|\(|\)|[A-Za-z_]\w*/g) ?? [];
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];

  function parseOr(): boolean {
    let v = parseAnd();
    while (peek() === '||') {
      pos++;
      const r = parseAnd();
      v = v || r;
    }
    return v;
  }
  function parseAnd(): boolean {
    let v = parseUnary();
    while (peek() === '&&') {
      pos++;
      const r = parseUnary();
      v = v && r;
    }
    return v;
  }
  function parseUnary(): boolean {
    if (peek() === '!') {
      pos++;
      return !parseUnary();
    }
    return parsePrimary();
  }
  function parsePrimary(): boolean {
    const t = peek();
    if (t === '(') {
      pos++;
      const v = parseOr();
      if (peek() === ')') pos++;
      return v;
    }
    pos++; // consume identifier / literal (or undefined at end of input)
    if (t === 'true') return true;
    if (t === 'false') return false;
    return isTruthy(t === undefined ? undefined : resolved[t]);
  }

  return parseOr();
}

const LITERALS = new Set(['true', 'false']);

/** The distinct variable identifiers referenced by a condition expression. */
export function conditionVariables(expr: string): string[] {
  return [...new Set(expr.match(/[A-Za-z_]\w*/g) ?? [])].filter((id) => !LITERALS.has(id));
}

// `#if\b(.*)` (not `#if\s+(.+)`) so a missing condition is recognized as a
// malformed marker rather than slipping through as ordinary content — otherwise
// its `#endif` would still be consumed and over-pop the block stack, silently
// leaking the rest of the block into the output. `\b` keeps `#ifdef` etc. inert.
const IF_RE = /^[ \t]*(?:\/\/|#)\s*#if\b(.*)$/;
const ENDIF_RE = /^[ \t]*(?:\/\/|#)\s*#endif\s*$/;

/**
 * Strip inline `#if <expr> ... #endif` comment blocks whose condition is false,
 * and remove the marker lines from blocks that are kept. Markers are ordinary
 * line comments (`// #if` for C-style sources, `# #if` for hash-comment sources)
 * so the unrendered skeleton still parses and type-checks with every block
 * present. Nesting is supported. Malformed markers (empty condition, an `#endif`
 * with no open `#if`, or an unclosed `#if`) throw rather than silently misrender.
 */
export function applyContentConditionals(
  content: string,
  resolved: Record<string, string>,
): string {
  if (!content.includes('#if') && !content.includes('#endif')) return content;

  const out: string[] = [];
  const keepStack: boolean[] = [];
  const keeping = (): boolean => keepStack.every(Boolean);
  let lineNo = 0;

  for (const line of content.split('\n')) {
    lineNo += 1;
    const ifMatch = IF_RE.exec(line);
    if (ifMatch) {
      const expr = ifMatch[1].trim();
      if (expr === '') {
        throw new TemplateRenderError(`Empty '#if' condition at line ${lineNo}`);
      }
      keepStack.push(keeping() && evalCondition(expr, resolved));
      continue;
    }
    if (ENDIF_RE.test(line)) {
      if (keepStack.length === 0) {
        throw new TemplateRenderError(`'#endif' without matching '#if' at line ${lineNo}`);
      }
      keepStack.pop();
      continue;
    }
    if (keeping()) out.push(line);
  }

  if (keepStack.length > 0) {
    throw new TemplateRenderError(`Unclosed '#if' block (${keepStack.length} still open)`);
  }

  return out.join('\n');
}
