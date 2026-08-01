# @nanohype/error-pages

Honest 404/500 pages for nanohype sites, plus a checker that holds any error
page — this package's default or a hand-built one — to the same contract.

```sh
npm install --save-dev @nanohype/error-pages
```

## The contract

An error page has to be honest, which means three things a normal page does not
have to worry about:

- **`noindex`.** An error page must never rank. Its links stay crawlable
  (`noindex, follow`), but the page itself does not belong in an index.
- **No JavaScript.** The app bundle may be the very thing that failed. A page
  that needs JS to render is a page that will not render exactly when it is
  needed.
- **Same-origin styling only.** Under a strict `style-src 'self'` CSP, an
  inline `<style>`, a `style=` attribute or a CDN stylesheet is dropped — and
  the visitor gets unstyled markup on top of whatever already went wrong.

`checkErrorPage` asserts all three, and optionally that the page declares the
status it claims to be, which catches a 500 shipped as a copy of the 404.

## Generating

```sh
nanohype-error-pages --out public --brand nanohype --home https://docs.nanohype.dev
```

Writes `404.html`, `500.html` and `error.css` into `--out`, creating it if
needed. Point it at whatever your build publishes to the origin root — `public/`
before a build, `dist/` after one.

| flag | meaning | default |
| --- | --- | --- |
| `--out <dir>` | directory to write into | *required* |
| `--brand <name>` | site wordmark, shown on the pages | *required* |
| `--home <href>` | primary-action link | `/` |
| `--stylesheet <path>` | same-origin stylesheet path | `/error.css` |
| `--lang <code>` | document language | `en` |

There is no theme flag. The pages render from
[`@nanohype/tokens`](../tokens), so a site's error page cannot drift from the
palette the rest of the site uses.

## Checking

```sh
nanohype-error-pages check dist/500.html --status 500
```

Exits non-zero on any violation and prints each one. Takes multiple files.

In a test, the same contract is available as a Vitest matcher:

```ts
import "@nanohype/error-pages/vitest";

expect(readFileSync("dist/404.html", "utf8")).toBeHonestErrorPage({ status: 404 });
```

## Wiring it into a site

The two verbs are meant to bracket the build — generate the pages before it,
verify the published output after it:

```json
{
  "scripts": {
    "prebuild": "nanohype-error-pages --out public --brand nanohype --home https://docs.nanohype.dev",
    "postbuild": "nanohype-error-pages check dist/500.html --status 500"
  }
}
```

Checking *after* the build rather than trusting the generator is the point: a
static-site framework can rewrite, inline or minify whatever lands in `public/`,
and the file that ships is the only one worth asserting against.

## The light/dark inversion

`@nanohype/tokens` ships dark in `:root` with `html.light` overriding it,
because an app can run a pre-paint script and pick a theme.

An error page cannot. A strict `script-src 'self'` blocks that script too, and
an error page is often a visitor's first hit, with empty `localStorage`. So the
generated stylesheet puts the **light** values in `:root` and the dark ones
behind `prefers-color-scheme: dark` — the OS decides, with no JavaScript and no
flash. Same token values either way; only which block holds which changes.

## API

```ts
import {
  buildErrorCss,
  checkErrorPage,
  renderErrorPage,
  renderSitePages,
  writeSitePages,
} from "@nanohype/error-pages";
```

- `renderErrorPage(options)` — one page as an HTML string
- `renderSitePages(options)` — `{ "404.html", "500.html", "error.css" }`
- `writeSitePages(outDir, options)` — the above, written to disk
- `buildErrorCss()` — the stylesheet alone
- `checkErrorPage(html, { status? })` — `{ ok, violations }`
