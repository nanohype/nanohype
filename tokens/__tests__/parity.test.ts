/**
 * The parity gate.
 *
 * `tokens.css` and `tokens.ts` are two copies of the same values, kept apart
 * because CSS custom properties are invisible to TypeScript and a chart or a
 * canvas cannot read a Tailwind utility. Two copies of anything drift, and this
 * pair would drift silently: adding `--color-info` to the CSS and forgetting the
 * mirror produces no error anywhere — a consumer reaching for `colors.info`
 * simply gets `undefined` and paints nothing.
 *
 * So the CSS is parsed and compared, and a mismatch fails the build. That check
 * is the reason this package can be published rather than copied.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { colors, duration, easing, fonts, light, radius } from "../src/tokens.js";

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "tokens.css"),
  "utf-8",
);

/** Pull one `--name: value;` block out of the stylesheet. */
function declarations(block: string): Record<string, string> {
  const start = CSS.indexOf(block);
  if (start === -1) throw new Error(`no ${block} block in tokens.css`);
  const body = CSS.slice(start, CSS.indexOf("\n}", start));

  const out: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    out[name] = value.trim();
  }
  return out;
}

/** Strip the Tailwind namespace prefix: `--color-card` → `card`. */
function scoped(decls: Record<string, string>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(decls)) {
    if (name.startsWith(`${prefix}-`)) out[name.slice(prefix.length + 1)] = value;
  }
  return out;
}

const themeDecls = declarations("@theme {");
const lightDecls = declarations("html.light {");

describe("tokens.css is parsed as expected", () => {
  it("finds both blocks with tokens in them", () => {
    // A parser that silently matched nothing would make every check below pass
    // vacuously, which is the one way this gate could fail open.
    expect(Object.keys(themeDecls).length).toBeGreaterThan(20);
    expect(Object.keys(lightDecls).length).toBeGreaterThan(20);
  });
});

describe.each([
  ["colors", scoped(themeDecls, "color"), colors as Record<string, string>],
  ["radius", scoped(themeDecls, "radius"), radius as Record<string, string>],
  ["fonts", scoped(themeDecls, "font"), fonts as Record<string, string>],
  ["easing", scoped(themeDecls, "ease"), easing as Record<string, string>],
  ["duration", scoped(themeDecls, "duration"), duration as Record<string, string>],
  ["light colors", scoped(lightDecls, "color"), light as Record<string, string>],
])("%s parity", (_name, css, ts) => {
  it("has the same token names in the stylesheet and the mirror", () => {
    expect(Object.keys(ts).sort()).toEqual(Object.keys(css).sort());
  });

  it("has the same value for every token", () => {
    expect(ts).toEqual(css);
  });
});

describe("the two themes", () => {
  it("define the same colours", () => {
    // A colour with no light override keeps its dark value when the user flips
    // the toggle — one unreadable surface, and nothing reports it.
    expect(Object.keys(light).sort()).toEqual(Object.keys(colors).sort());
  });

  it("actually differ, so the light theme is doing something", () => {
    const identical = Object.keys(colors).filter(
      (key) => colors[key as keyof typeof colors] === light[key as keyof typeof light],
    );
    // A handful legitimately match (white foregrounds on filled buttons). Most
    // must not: if they did, `html.light` would be a no-op nobody noticed.
    expect(identical.length).toBeLessThan(Object.keys(colors).length / 2);
  });
});
