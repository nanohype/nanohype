import { describe, expect, it } from "vitest";

import { checkErrorPage } from "../src/check.js";
import { renderErrorPage } from "../src/render.js";

const honest = renderErrorPage({ status: 404, brand: "nanohype" });

describe("checkErrorPage", () => {
  it("passes the page this package renders", () => {
    // The default has to satisfy its own contract, or the contract is decorative.
    expect(checkErrorPage(honest)).toEqual({ ok: true, violations: [] });
  });

  it("passes a status assertion the page satisfies", () => {
    expect(checkErrorPage(honest, { status: 404 }).ok).toBe(true);
  });

  it("catches a 500 shipped as a copy of the 404", () => {
    const report = checkErrorPage(honest, { status: 500 });
    expect(report.ok).toBe(false);
    expect(report.violations).toEqual(['page does not declare status 500 (add data-status="500")']);
  });

  it("accepts a bare numeral as the status declaration", () => {
    // A bespoke page need not carry data-status; the visible code counts.
    const bespoke = '<meta name="robots" content="noindex"><h1>404</h1>';
    expect(checkErrorPage(bespoke, { status: 404 }).ok).toBe(true);
  });

  it("requires a robots meta", () => {
    expect(checkErrorPage("<h1>gone</h1>").violations).toContain(
      'missing <meta name="robots"> — an error page must be noindex',
    );
  });

  it("requires that robots meta to say noindex", () => {
    expect(checkErrorPage('<meta name="robots" content="follow">').violations).toContain(
      '<meta name="robots"> does not include noindex',
    );
  });

  it.each([
    [
      "<script>alert(1)</script>",
      "contains a <script> — error pages must render without JavaScript",
    ],
    [
      '<a onclick="go()">x</a>',
      "contains an inline event handler (on*=) — error pages must be JS-free",
    ],
    [
      "<style>body{}</style>",
      "inline <style> block — move styling to a same-origin stylesheet (style-src 'self')",
    ],
    [
      '<div style="color:red">x</div>',
      "inline style= attribute — move styling to a same-origin stylesheet (style-src 'self')",
    ],
    [
      "<link rel=stylesheet href='/a.css'>@import url(https://cdn.example/x.css);",
      "cross-origin @import — error-page CSS must stay same-origin",
    ],
  ])("rejects %s", (html, violation) => {
    expect(checkErrorPage(html).violations).toContain(violation);
  });

  it.each([
    ["https://cdn.example/x.css", "an absolute URL"],
    ["//cdn.example/x.css", "a protocol-relative URL"],
  ])("rejects a cross-origin stylesheet given as %s (%s)", (href) => {
    const report = checkErrorPage(`<link rel="stylesheet" href="${href}">`);
    expect(report.violations).toContain(
      `cross-origin stylesheet <link href="${href}"> — link a same-origin stylesheet instead`,
    );
  });

  it("allows a same-origin stylesheet", () => {
    const html = `<meta name="robots" content="noindex"><link rel="stylesheet" href="/error.css">`;
    expect(checkErrorPage(html).ok).toBe(true);
  });

  it("ignores a stylesheet link with no href at all", () => {
    // Malformed rather than cross-origin: there is nothing to resolve, so this
    // is not the violation this check is looking for.
    const html = `<meta name="robots" content="noindex"><link rel="stylesheet">`;
    expect(checkErrorPage(html).ok).toBe(true);
  });

  it("reports every violation at once rather than the first", () => {
    const report = checkErrorPage("<script></script><style></style>");
    expect(report.violations.length).toBeGreaterThan(2);
  });
});
