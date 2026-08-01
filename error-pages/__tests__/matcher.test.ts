import { describe, expect, it } from "vitest";

import { renderErrorPage } from "../src/render.js";
import "../src/vitest.js";

describe("toBeHonestErrorPage", () => {
  it("passes an honest page", () => {
    expect(renderErrorPage({ status: 404, brand: "nanohype" })).toBeHonestErrorPage();
  });

  it("passes a status assertion the page satisfies", () => {
    expect(renderErrorPage({ status: 500, brand: "x" })).toBeHonestErrorPage({ status: 500 });
  });

  it("fails a page that violates the contract", () => {
    expect(() => expect("<script></script>").toBeHonestErrorPage()).toThrow(
      /error-page contract violations/,
    );
  });

  it("fails on a non-string rather than throwing inside the checker", () => {
    expect(() => expect(42).toBeHonestErrorPage()).toThrow(
      /expected an HTML string, received number/,
    );
  });

  it("negates, so a deliberately broken fixture can be asserted broken", () => {
    expect("<script></script>").not.toBeHonestErrorPage();
  });

  it("reports the honest case when negated against an honest page", () => {
    expect(() =>
      expect(renderErrorPage({ status: 404, brand: "x" })).not.toBeHonestErrorPage(),
    ).toThrow(/but it is honest/);
  });
});
