import { buildErrorCss } from "./css.js";

/** The copy for one status code. Every field has a sensible default per status. */
export interface StatusCopy {
  /** The large numeral. Defaults to the status. */
  code?: string;
  /** The `<h1>`. */
  heading: string;
  /** The supporting sentence. */
  message: string;
  /** The primary-action label. */
  homeLabel: string;
}

const DEFAULT_COPY: Record<number, StatusCopy> = {
  404: {
    heading: "Page not found",
    message: "The page you're looking for doesn't exist, or it has moved.",
    homeLabel: "Back to home",
  },
  500: {
    heading: "Something went wrong",
    message: "An unexpected error occurred on our end. Give it a moment, then try again.",
    homeLabel: "Back to home",
  },
};

function copyFor(status: number): StatusCopy {
  return (
    DEFAULT_COPY[status] ?? {
      heading: `Error ${status}`,
      message: "Something went wrong.",
      homeLabel: "Back to home",
    }
  );
}

/** One error page. `stylesheetHref` must resolve on the same origin (CSP `style-src 'self'`). */
export interface ErrorPageOptions {
  /** HTTP status the page represents (e.g. 404, 500). */
  status: number;
  /** Site wordmark, shown as the eyebrow and in `<title>`. */
  brand: string;
  /** Primary-action href. Default `/`. */
  home?: string;
  /** Same-origin path to the stylesheet. Default `/error.css`. */
  stylesheetHref?: string;
  /** Document language. Default `en`. */
  lang?: string;
  /** Override the default copy for this status. */
  copy?: Partial<StatusCopy>;
}

/**
 * Render one self-contained, JS-free error page. The markup carries no styling of
 * its own — it links `stylesheetHref` (same origin, CSP-clean) and is themed by the
 * CSS that `buildErrorCss` / `renderSitePages` emit alongside it. Always
 * `noindex, follow`: an error page must never rank, but its links stay crawlable.
 */
export function renderErrorPage(options: ErrorPageOptions): string {
  const {
    status,
    brand,
    home = "/",
    stylesheetHref = "/error.css",
    lang = "en",
    copy: overrides,
  } = options;

  const base = copyFor(status);
  const copy: StatusCopy = { ...base, ...stripUndefined(overrides ?? {}) };
  const code = copy.code ?? String(status);

  return `<!doctype html>
<html lang="${attr(lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, follow" />
    <title>${text(copy.heading)} · ${text(brand)}</title>
    <link rel="stylesheet" href="${attr(stylesheetHref)}" />
  </head>
  <body>
    <main>
      <p class="eyebrow">${text(brand)}</p>
      <div class="code" data-status="${attr(String(status))}" aria-hidden="true">${text(code)}</div>
      <h1>${text(copy.heading)}</h1>
      <p>${text(copy.message)}</p>
      <div class="actions">
        <a class="button" href="${attr(home)}">${text(copy.homeLabel)}</a>
      </div>
    </main>
  </body>
</html>
`;
}

/** What a site publishes to its origin root: two pages plus the shared stylesheet. */
export interface SitePages {
  "404.html": string;
  "500.html": string;
  "error.css": string;
}

/** Everything a site needs to theme and render its error pages in one call. */
export interface SitePagesOptions {
  /** Site wordmark. */
  brand: string;
  /** Primary-action href. Default `/`. */
  home?: string;
  /** Same-origin stylesheet path shared by both pages. Default `/error.css`. */
  stylesheetHref?: string;
  /** Document language. Default `en`. */
  lang?: string;
  /** Per-status copy overrides, keyed by status code. */
  copy?: Record<number, Partial<StatusCopy>>;
}

/**
 * Render a site's full error-page set — `404.html`, `500.html`, and the shared
 * `error.css`. This is what `writeSitePages` (and the CLI) emit to the origin
 * root.
 *
 * There is no theme argument. The pages render from `@nanohype/tokens`, which
 * is the whole point: a site whose error page drifted from its own palette is
 * exactly the thing a shared package should make impossible.
 */
export function renderSitePages(options: SitePagesOptions): SitePages {
  const { brand, home = "/", stylesheetHref = "/error.css", lang = "en", copy = {} } = options;

  const page = (status: number): string =>
    renderErrorPage({
      status,
      brand,
      home,
      stylesheetHref,
      lang,
      ...(copy[status] !== undefined ? { copy: copy[status] } : {}),
    });

  return {
    "404.html": page(404),
    "500.html": page(500),
    "error.css": buildErrorCss(),
  };
}

/** Escape text-node content. */
function text(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape a double-quoted attribute value. */
function attr(value: string): string {
  return text(value).replace(/"/g, "&quot;");
}

/** Drop keys whose value is `undefined` so a `{ code: undefined }` never overrides a default. */
function stripUndefined<T extends object>(object: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
