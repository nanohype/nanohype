import { colors, light } from "@nanohype/tokens";
import { describe, expect, it } from "vitest";

import { buildErrorCss } from "../src/css.js";
import { renderErrorPage, renderSitePages } from "../src/render.js";

describe("renderErrorPage", () => {
  it("names the brand in the title and the eyebrow", () => {
    const html = renderErrorPage({ status: 404, brand: "nanohype" });
    expect(html).toContain("<title>Page not found · nanohype</title>");
    expect(html).toContain('<p class="eyebrow">nanohype</p>');
  });

  it("carries default copy per status", () => {
    expect(renderErrorPage({ status: 500, brand: "x" })).toContain("Something went wrong");
  });

  it("falls back to generic copy for a status it has no defaults for", () => {
    const html = renderErrorPage({ status: 418, brand: "x" });
    expect(html).toContain("Error 418");
    expect(html).toContain('data-status="418"');
  });

  it("applies copy overrides", () => {
    const html = renderErrorPage({
      status: 404,
      brand: "x",
      copy: { heading: "Nothing here", code: "¯\\_(ツ)_/¯" },
    });
    expect(html).toContain("Nothing here");
    expect(html).toContain("¯\\_(ツ)_/¯");
  });

  it("ignores an explicitly undefined override rather than blanking the default", () => {
    // `{ code: undefined }` is what spreading an optional field produces; it
    // must not win over the default the way a plain spread would let it.
    const html = renderErrorPage({ status: 404, brand: "x", copy: { code: undefined } });
    expect(html).toContain(">404</div>");
  });

  it("escapes text nodes, leaving quotes alone where they are harmless", () => {
    // brand lands in text position. `<`, `>` and `&` must go; a bare `"` is
    // inert between tags, and escaping it there would only make the page noisy.
    const html = renderErrorPage({ status: 404, brand: '<script>&"' });
    expect(html).not.toContain("<script>&");
    expect(html).toContain('&lt;script&gt;&amp;"');
  });

  it("escapes attributes, where a quote is what breaks out", () => {
    // home lands inside a double-quoted href. An unescaped `"` there closes the
    // attribute and everything after it becomes markup — this input would add a
    // live onload handler to the anchor.
    const html = renderErrorPage({ status: 404, brand: "x", home: '/x"onload="go()' });
    expect(html).toContain('href="/x&quot;onload=&quot;go()"');
    expect(html).not.toMatch(/\sonload=/);
  });

  it("honours home, stylesheet and lang overrides", () => {
    const html = renderErrorPage({
      status: 404,
      brand: "x",
      home: "https://docs.nanohype.dev",
      stylesheetHref: "/assets/e.css",
      lang: "fr",
    });
    expect(html).toContain('href="https://docs.nanohype.dev"');
    expect(html).toContain('href="/assets/e.css"');
    expect(html).toContain('<html lang="fr">');
  });

  it("defaults home, stylesheet and lang", () => {
    const html = renderErrorPage({ status: 404, brand: "x" });
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('href="/error.css"');
    expect(html).toContain('class="button" href="/"');
  });
});

describe("renderSitePages", () => {
  it("emits both pages and the shared stylesheet", () => {
    const pages = renderSitePages({ brand: "nanohype" });
    expect(Object.keys(pages).sort()).toEqual(["404.html", "500.html", "error.css"]);
    expect(pages["404.html"]).toContain('data-status="404"');
    expect(pages["500.html"]).toContain('data-status="500"');
    expect(pages["error.css"]).toBe(buildErrorCss());
  });

  it("applies per-status copy overrides", () => {
    const pages = renderSitePages({ brand: "x", copy: { 500: { heading: "Boom" } } });
    expect(pages["500.html"]).toContain("Boom");
    expect(pages["404.html"]).toContain("Page not found");
  });

  it("passes home, stylesheet and lang through to both pages", () => {
    const pages = renderSitePages({
      brand: "x",
      home: "/start",
      stylesheetHref: "/e.css",
      lang: "de",
    });
    for (const page of [pages["404.html"], pages["500.html"]]) {
      expect(page).toContain('href="/start"');
      expect(page).toContain('href="/e.css"');
      expect(page).toContain('<html lang="de">');
    }
  });
});

describe("buildErrorCss", () => {
  it("puts the light values in :root and the dark ones behind the media query", () => {
    // The inversion against tokens.css is deliberate — no theme script can run
    // on an error page, so the media query decides. Asserting the specific
    // values rather than the block structure: a stylesheet that emitted the
    // dark palette twice would still parse and still look structurally right.
    const css = buildErrorCss();
    const root = css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme"));
    const dark = css.slice(css.indexOf("@media (prefers-color-scheme"));

    expect(root).toContain(`--background: ${light.background};`);
    expect(dark).toContain(`--background: ${colors.background};`);
    expect(light.background).not.toBe(colors.background);
  });

  it("resolves every custom property it references", () => {
    // A var(--x) with no --x declaration renders as nothing at all: the page
    // loses a colour and still returns 200 from the CDN.
    const css = buildErrorCss();
    const declared = new Set([...css.matchAll(/^\s*--([\w-]+):/gm)].map((m) => m[1]));
    const referenced = new Set([...css.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]));

    expect(referenced.size).toBeGreaterThan(5);
    expect([...referenced].filter((name) => !declared.has(name as string))).toEqual([]);
  });

  it("stays same-origin, so the checker's own CSS rule cannot fire on it", () => {
    expect(buildErrorCss()).not.toMatch(/@import|https?:\/\//);
  });
});
