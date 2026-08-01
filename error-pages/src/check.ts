/**
 * The error-page contract.
 *
 * An error page — this package's default or a hand-built creative one — must be
 * *honest*: it must not rank (`noindex`), it must render with no JavaScript (the
 * app bundle may be the very thing that failed), and its styling must come only
 * from its own origin (so a strict `style-src 'self'` CSP can never blank it).
 * `checkErrorPage` asserts exactly that against an HTML string. The `./vitest`
 * matcher and the CLI `check` verb both wrap it, so the same contract guards a
 * turnkey default and a bespoke 404 alike.
 */

/** Options for {@link checkErrorPage}. */
export interface CheckErrorPageOptions {
  /**
   * The HTTP status the page represents (e.g. 404, 500). When given, the page
   * must declare it — via `data-status="<code>"` or the bare numeral — so a 500
   * accidentally shipped as a copy of the 404 is caught.
   */
  status?: number;
}

/** The result of checking one page: `ok`, plus a human-readable reason per failure. */
export interface ErrorPageReport {
  ok: boolean;
  violations: string[];
}

// The two patterns that open on a bare `<` exclude `<` from the run that
// follows it, rather than only `>`. A tag body cannot contain a raw `<`
// anyway, so this is the stricter reading — and it is what keeps them linear.
//
// With `[^>]+`, input of many consecutive `<` makes every one of them a fresh
// start position whose scan runs to the end of the string: quadratic, on input
// this package accepts from a caller. `[^<>]+` fails at the second character
// instead. The patterns that name a tag (`<meta\b`, `<link\b`) never had the
// problem — a `<` not followed by that name is rejected immediately.
const ROBOTS_META = /<meta\b[^>]*\bname=(["'])robots\1[^>]*>/i;
const CONTENT_ATTR = /\bcontent=(["'])([^"']*)\1/i;
const SCRIPT_TAG = /<script\b/i;
const EVENT_HANDLER = /<[^<>]+\son[a-z]+\s*=/i;
const STYLESHEET_LINK = /<link\b[^>]*\brel=(["'])[^"']*\bstylesheet\b[^"']*\1[^>]*>/gi;
const HREF_ATTR = /\bhref=(["'])([^"']*)\1/i;
const INLINE_STYLE_TAG = /<style\b/i;
const INLINE_STYLE_ATTR = /<[^<>]+\sstyle=["']/i;
const CROSS_ORIGIN_IMPORT = /@import\s+(?:url\(\s*)?(["']?)(?:https?:)?\/\//i;

/** True for absolute (`https://…`) or protocol-relative (`//…`) URLs; false for same-origin paths. */
function isCrossOrigin(href: string): boolean {
  const trimmed = href.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith("//");
}

/**
 * Check an error page's HTML against the contract. Returns every violation
 * rather than throwing, so a caller (matcher or CLI) can report them all at once.
 * An honest page returns `{ ok: true, violations: [] }`.
 */
export function checkErrorPage(html: string, options: CheckErrorPageOptions = {}): ErrorPageReport {
  const violations: string[] = [];

  // (1) noindex — an error page must never rank.
  const robots = ROBOTS_META.exec(html);
  if (!robots) {
    violations.push('missing <meta name="robots"> — an error page must be noindex');
  } else {
    const content = CONTENT_ATTR.exec(robots[0]);
    if (!content || !/\bnoindex\b/i.test(content[2])) {
      violations.push('<meta name="robots"> does not include noindex');
    }
  }

  // (2) JS-free — the page must still render when the app bundle is the thing that broke.
  if (SCRIPT_TAG.test(html)) {
    violations.push("contains a <script> — error pages must render without JavaScript");
  }
  if (EVENT_HANDLER.test(html)) {
    violations.push("contains an inline event handler (on*=) — error pages must be JS-free");
  }

  // (3) same-origin styling — nothing a strict `style-src 'self'` would drop.
  for (const link of html.matchAll(STYLESHEET_LINK)) {
    const href = HREF_ATTR.exec(link[0]);
    const url = href?.[2];
    if (url && isCrossOrigin(url)) {
      // Reported as a bare URL rather than reconstructed markup. This string is
      // read in a terminal, so the angle brackets were only noise — and quoting
      // caller-supplied text back inside an attribute shape is the pattern
      // static analysis flags as sanitisation, which it is not doing here.
      violations.push(`cross-origin stylesheet: ${url} — link a same-origin stylesheet instead`);
    }
  }
  if (INLINE_STYLE_TAG.test(html)) {
    violations.push(
      "inline <style> block — move styling to a same-origin stylesheet (style-src 'self')",
    );
  }
  if (INLINE_STYLE_ATTR.test(html)) {
    violations.push(
      "inline style= attribute — move styling to a same-origin stylesheet (style-src 'self')",
    );
  }
  if (CROSS_ORIGIN_IMPORT.test(html)) {
    violations.push("cross-origin @import — error-page CSS must stay same-origin");
  }

  // (4) declared status — optional; catches a mislabelled page.
  if (options.status !== undefined) {
    const code = String(options.status);
    const declared =
      new RegExp(`\\bdata-status=(["'])${code}\\1`).test(html) ||
      new RegExp(`>\\s*${code}\\s*<`).test(html);
    if (!declared) {
      violations.push(`page does not declare status ${code} (add data-status="${code}")`);
    }
  }

  return { ok: violations.length === 0, violations };
}
