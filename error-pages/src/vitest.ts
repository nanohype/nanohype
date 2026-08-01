/**
 * A Vitest matcher for the error-page contract. Import once in a test (or a
 * `setupFiles` entry) for its side effect:
 *
 * ```ts
 * import "@nanohype/error-pages/vitest";
 *
 * expect(readFileSync("dist/404.html", "utf8")).toBeHonestErrorPage({ status: 404 });
 * ```
 *
 * The assertion wraps {@link checkErrorPage}, so a hand-built 404 and the shared
 * default are held to the same bar: noindex, JavaScript-free, same-origin-styled.
 */
import { expect } from "vitest";

import { type CheckErrorPageOptions, checkErrorPage } from "./check.js";

interface ErrorPageMatchers<R = unknown> {
  toBeHonestErrorPage: (options?: CheckErrorPageOptions) => R;
}

declare module "vitest" {
  // biome-ignore lint/suspicious/noExplicitAny: vitest's own Assertion signature is generic over any.
  interface Assertion<T = any> extends ErrorPageMatchers<T> {}
  interface AsymmetricMatchersContaining extends ErrorPageMatchers {}
}

expect.extend({
  toBeHonestErrorPage(received: unknown, options: CheckErrorPageOptions = {}) {
    if (typeof received !== "string") {
      return {
        pass: false,
        message: () => `expected an HTML string, received ${typeof received}`,
      };
    }

    const report = checkErrorPage(received, options);
    return {
      pass: report.ok,
      message: () =>
        report.ok
          ? "expected the page to violate the error-page contract, but it is honest"
          : `error-page contract violations:\n${report.violations.map((v) => `  - ${v}`).join("\n")}`,
    };
  },
});
