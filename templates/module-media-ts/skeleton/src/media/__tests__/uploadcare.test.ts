import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProvider } from "../providers/registry.js";
// For its side effect: the module exports nothing and registers its factory at
// import time, so this is how the provider is reached.
import "../providers/uploadcare.js";
import type { MediaProvider } from "../providers/types.js";
import type { FitMode, TransformOptions } from "../types.js";

// ── Uploadcare provider tests ─────────────────────────────────────
//
// The provider holds an account's secret key and authenticates every REST call
// with it, so the failure that matters is a request the server rejects with 401
// and no indication which of the five signed components was wrong. These pin
// the construction against Uploadcare's published scheme rather than against
// what the adapter emits:
//
//   signature = HMAC-SHA1(secretKey, method \n contentMd5 \n contentType \n date \n uri)
//   Authorization: Uploadcare <publicKey>:<signature>
//
// https://uploadcare.com/docs/api/rest/authentication/
//
// Nothing here reaches the network: `fetch` is stubbed for every call, and the
// clock is stubbed wherever a signed timestamp is asserted.

const PUBLIC_KEY = "public-key-from-config";
const SECRET_KEY = "secret-key-from-config";
const REST_API_VERSION = "application/vnd.uploadcare-v0.7+json";

/** MD5 of the empty string — the contentMd5 component of a bodyless request. */
const EMPTY_BODY_MD5 = createHash("md5").update("").digest("hex");

interface FetchCall {
  url: string;
  init: RequestInit;
}

/** Records every request and answers it from `route`, without a network. */
function stubFetch(route: (url: string, init: RequestInit) => Response): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}): Promise<Response> => {
    calls.push({ url, init });
    return Promise.resolve(route(url, init));
  });
  return calls;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function headersOf(call: FetchCall): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

/**
 * The Authorization header the published scheme requires, computed here from
 * the components rather than from the adapter, so a change to either side of
 * the comparison has to be argued for against the vendor's specification.
 */
function expectedAuthorization(
  method: string,
  uri: string,
  date: string,
  publicKey = PUBLIC_KEY,
  secretKey = SECRET_KEY,
): string {
  const signString = [method, EMPTY_BODY_MD5, "application/json", date, uri].join("\n");
  const signature = createHmac("sha1", secretKey).update(signString).digest("hex");
  return `Uploadcare ${publicKey}:${signature}`;
}

/**
 * Installs a `Date` whose no-argument constructor hands out a different instant
 * on every call, and returns the UTC strings it handed out in order.
 *
 * A timestamp is only provably the one that was signed if two reads of the
 * clock are distinguishable. Under a real clock the two happen inside the same
 * second, and under a frozen one they are equal by construction, so a header
 * recomputed after signing renders identically to the signed value and the
 * substitution is invisible. Stepping the clock makes it visible.
 */
function stubSteppingClock(startMs: number, stepMs = 60_000): string[] {
  const RealDate = Date;
  const handedOut: string[] = [];
  class SteppingDate extends RealDate {
    constructor(value?: number | string | Date) {
      if (value === undefined) {
        const at = startMs + handedOut.length * stepMs;
        handedOut.push(new RealDate(at).toUTCString());
        super(at);
      } else {
        super(value);
      }
    }
  }
  vi.stubGlobal("Date", SteppingDate);
  return handedOut;
}

async function initialized(): Promise<MediaProvider> {
  const provider = getProvider("uploadcare");
  await provider.init({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY });
  return provider;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("uploadcare provider initialization", () => {
  it("refuses to start without a public key", async () => {
    vi.stubEnv("UPLOADCARE_PUBLIC_KEY", undefined);
    vi.stubEnv("UPLOADCARE_SECRET_KEY", undefined);

    await expect(getProvider("uploadcare").init({ secretKey: SECRET_KEY })).rejects.toThrow(
      /requires publicKey and secretKey/,
    );
  });

  it("refuses to start without a secret key", async () => {
    vi.stubEnv("UPLOADCARE_PUBLIC_KEY", undefined);
    vi.stubEnv("UPLOADCARE_SECRET_KEY", undefined);

    await expect(getProvider("uploadcare").init({ publicKey: PUBLIC_KEY })).rejects.toThrow(
      /requires publicKey and secretKey/,
    );
  });

  it("refuses to start with neither credential", async () => {
    vi.stubEnv("UPLOADCARE_PUBLIC_KEY", undefined);
    vi.stubEnv("UPLOADCARE_SECRET_KEY", undefined);

    await expect(getProvider("uploadcare").init({})).rejects.toThrow(
      /UPLOADCARE_PUBLIC_KEY, UPLOADCARE_SECRET_KEY/,
    );
  });

  it("signs with the environment credentials when the config omits them", async () => {
    vi.stubEnv("UPLOADCARE_PUBLIC_KEY", "public-key-from-env");
    vi.stubEnv("UPLOADCARE_SECRET_KEY", "secret-key-from-env");
    const calls = stubFetch(() => json({ results: [] }));

    const provider = getProvider("uploadcare");
    await provider.init({});
    await provider.list();

    const headers = headersOf(calls[0]);
    expect(headers.Authorization).toBe(
      expectedAuthorization(
        "GET",
        "/files/?",
        headers.Date,
        "public-key-from-env",
        "secret-key-from-env",
      ),
    );
  });

  it("signs with the config credentials in preference to the environment", async () => {
    vi.stubEnv("UPLOADCARE_PUBLIC_KEY", "public-key-from-env");
    vi.stubEnv("UPLOADCARE_SECRET_KEY", "secret-key-from-env");
    const calls = stubFetch(() => json({ results: [] }));

    const provider = await initialized();
    await provider.list();

    const headers = headersOf(calls[0]);
    expect(headers.Authorization).toBe(expectedAuthorization("GET", "/files/?", headers.Date));
  });

  it("refuses a REST call made before init", async () => {
    await expect(getProvider("uploadcare").list()).rejects.toThrow(/not initialized/);
  });

  it("refuses an upload made before init", async () => {
    await expect(getProvider("uploadcare").upload(Buffer.from("x"))).rejects.toThrow(
      /not initialized/,
    );
  });
});

describe("uploadcare REST authentication", () => {
  it("signs HMAC-SHA1 over the five components joined by newlines", async () => {
    const calls = stubFetch(() => json({ results: [] }));
    const provider = await initialized();

    await provider.list();

    const headers = headersOf(calls[0]);
    expect(headers.Authorization).toBe(expectedAuthorization("GET", "/files/?", headers.Date));
  });

  it("digests an absent body as MD5 of the empty string, not as the empty string", async () => {
    const calls = stubFetch(() => json({ results: [] }));
    const provider = await initialized();

    await provider.list();

    // Signing "" instead produces a well-formed header over a different base
    // than the server computes, and every call comes back 401.
    const headers = headersOf(calls[0]);
    const withEmptyString = createHmac("sha1", SECRET_KEY)
      .update(["GET", "", "application/json", headers.Date, "/files/?"].join("\n"))
      .digest("hex");
    expect(headers.Authorization).not.toBe(`Uploadcare ${PUBLIC_KEY}:${withEmptyString}`);
  });

  it("pins the REST API version and the signed content type on every call", async () => {
    const calls = stubFetch(() => json({ results: [] }));
    const provider = await initialized();

    await provider.list();

    const headers = headersOf(calls[0]);
    expect(headers.Accept).toBe(REST_API_VERSION);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends the Date it signed rather than one recomputed after signing", async () => {
    const calls = stubFetch(() => json({ results: [] }));
    const provider = await initialized();
    // Installed after init so the provider's own startup log does not consume
    // a tick: the first instant handed out is the one signedHeaders signs.
    const instants = stubSteppingClock(Date.UTC(2024, 0, 2, 3, 4, 5));

    await provider.list();

    const headers = headersOf(calls[0]);
    // The server rejects a skew over 15 minutes, so a header regenerated after
    // signing fails intermittently, which is worse than failing outright.
    expect(headers.Date).toBe(instants[0]);
    expect(headers.Authorization).toBe(expectedAuthorization("GET", "/files/?", headers.Date));
  });

  it("signs the method it sends", async () => {
    const calls = stubFetch(() => new Response(null, { status: 204 }));
    const provider = await initialized();

    await provider.delete("f1e2d3c4");

    const headers = headersOf(calls[0]);
    expect(calls[0].init.method).toBe("DELETE");
    expect(headers.Authorization).toBe(
      expectedAuthorization("DELETE", "/files/f1e2d3c4/", headers.Date),
    );
    // A signature over the wrong method is still 40 hex characters.
    expect(headers.Authorization).not.toBe(
      expectedAuthorization("GET", "/files/f1e2d3c4/", headers.Date),
    );
  });

  it("signs the exact URI it requests, query string included", async () => {
    const calls = stubFetch(() => json({ results: [] }));
    const provider = await initialized();

    await provider.list({ maxResults: 25, cursor: "100" });

    const uri = "/files/?limit=25&offset=100";
    expect(calls[0].url).toBe(`https://api.uploadcare.com${uri}`);
    const headers = headersOf(calls[0]);
    expect(headers.Authorization).toBe(expectedAuthorization("GET", uri, headers.Date));
    // Signing the path without its query is the easy omission to miss.
    expect(headers.Authorization).not.toBe(expectedAuthorization("GET", "/files/", headers.Date));
  });
});

describe("uploadcare upload", () => {
  const FILE_INFO = {
    original_filename: "beach.jpg",
    mime_type: "image/jpeg",
    size: 4096,
    image_info: { width: 1600, height: 900 },
    datetime_uploaded: "2024-01-02T03:04:05.000Z",
  };

  function routeUpload(uuid: string, info: Response): (url: string) => Response {
    return (url: string) => (url.startsWith("https://upload.") ? json({ file: uuid }) : info);
  }

  it("posts the unsigned upload form and returns the metadata the API reports", async () => {
    const calls = stubFetch(routeUpload("a1b2", json(FILE_INFO)));
    const provider = await initialized();

    const asset = await provider.upload(Buffer.from("bytes"));

    expect(calls[0].url).toBe("https://upload.uploadcare.com/base/");
    expect(calls[0].init.method).toBe("POST");
    const form = calls[0].init.body as FormData;
    expect(form.get("UPLOADCARE_PUB_KEY")).toBe(PUBLIC_KEY);
    expect(form.get("UPLOADCARE_STORE")).toBe("auto");
    expect((form.get("file") as File).name).toBe("upload");

    expect(asset).toEqual({
      id: "a1b2",
      filename: "beach.jpg",
      contentType: "image/jpeg",
      size: 4096,
      width: 1600,
      height: 900,
      createdAt: new Date("2024-01-02T03:04:05.000Z"),
    });
  });

  it("signs the file-info call for the uuid the upload returned", async () => {
    const calls = stubFetch(routeUpload("c3d4", json(FILE_INFO)));
    const provider = await initialized();

    await provider.upload(Buffer.from("bytes"));

    const uri = "/files/c3d4/";
    expect(calls[1].url).toBe(`https://api.uploadcare.com${uri}`);
    const headers = headersOf(calls[1]);
    expect(headers.Authorization).toBe(expectedAuthorization("GET", uri, headers.Date));
  });

  it("sends the requested filename and each metadata entry", async () => {
    const calls = stubFetch(routeUpload("e5f6", json({})));
    const provider = await initialized();

    await provider.upload(Buffer.from("bytes"), {
      filename: "portrait.png",
      metadata: { alt: "a portrait", owner: "ops" },
    });

    const form = calls[0].init.body as FormData;
    expect((form.get("file") as File).name).toBe("portrait.png");
    expect(form.get("metadata[alt]")).toBe("a portrait");
    expect(form.get("metadata[owner]")).toBe("ops");
  });

  it("falls back to the requested filename when the API reports no metadata", async () => {
    stubFetch(routeUpload("07a8", new Response("gone", { status: 404 })));
    const provider = await initialized();

    const asset = await provider.upload(Buffer.from("bytes"), { filename: "portrait.png" });

    expect(asset.filename).toBe("portrait.png");
    expect(asset.contentType).toBeUndefined();
    expect(asset.size).toBeUndefined();
    expect(asset.width).toBeUndefined();
    expect(asset.height).toBeUndefined();
    expect(asset.createdAt).toBeInstanceOf(Date);
  });

  it("names an unnamed upload and reports no filename when the API reports none", async () => {
    const calls = stubFetch(routeUpload("b9c0", json({ mime_type: "image/webp" })));
    const provider = await initialized();

    const asset = await provider.upload(Buffer.from("bytes"), { contentType: "image/webp" });

    const form = calls[0].init.body as FormData;
    expect((form.get("file") as File).name).toBe("upload");
    expect(asset.filename).toBeUndefined();
    expect(asset.contentType).toBe("image/webp");
  });

  it("reports the status and body when the upload is rejected", async () => {
    stubFetch(() => new Response("invalid public key", { status: 403 }));
    const provider = await initialized();

    await expect(provider.upload(Buffer.from("bytes"))).rejects.toThrow(
      "Uploadcare upload failed (403): invalid public key",
    );
  });
});

describe("uploadcare delivery URLs", () => {
  it("returns the plain CDN URL when no transforms are asked for", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2")).toEqual({
      url: "https://ucarecdn.com/a1b2/",
      width: undefined,
      height: undefined,
      format: undefined,
    });
  });

  it("crops to both dimensions for a cover fit", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { width: 320, height: 240, fit: "cover" }).url).toBe(
      "https://ucarecdn.com/a1b2/-/scale_crop/320x240/center/",
    );
  });

  it("crops to both dimensions when no fit is named", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { width: 320, height: 240 }).url).toBe(
      "https://ucarecdn.com/a1b2/-/scale_crop/320x240/center/",
    );
  });

  it("enables stretching for a fill fit", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { width: 320, height: 240, fit: "fill" }).url).toBe(
      "https://ucarecdn.com/a1b2/-/stretch/on/-/resize/320x240/",
    );
  });

  it("resizes within both dimensions for a contain fit", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { width: 320, height: 240, fit: "contain" }).url).toBe(
      "https://ucarecdn.com/a1b2/-/resize/320x240/",
    );
  });

  it("resizes within both dimensions for a scale fit", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { width: 320, height: 240, fit: "scale" }).url).toBe(
      "https://ucarecdn.com/a1b2/-/resize/320x240/",
    );
  });

  it("crops for a fit mode outside the vocabulary", async () => {
    const provider = await initialized();
    // The type system rules this out; a JavaScript caller does not, and the
    // fallback is what keeps an unknown mode from reaching the CDN verbatim.
    const transforms: TransformOptions = {
      width: 320,
      height: 240,
      fit: "diagonal" as unknown as FitMode,
    };

    expect(provider.getUrl("a1b2", transforms).url).toBe(
      "https://ucarecdn.com/a1b2/-/scale_crop/320x240/center/",
    );
  });

  it("resizes on width alone, leaving height free", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { width: 320 }).url).toBe(
      "https://ucarecdn.com/a1b2/-/resize/320x/",
    );
  });

  it("resizes on height alone, leaving width free", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { height: 240 }).url).toBe(
      "https://ucarecdn.com/a1b2/-/resize/x240/",
    );
  });

  it("appends an explicit output format", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { format: "webp" }).url).toBe(
      "https://ucarecdn.com/a1b2/-/format/webp/",
    );
  });

  it("appends content negotiation for an automatic format", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { format: "auto" }).url).toBe(
      "https://ucarecdn.com/a1b2/-/format/auto/",
    );
  });

  it("maps any requested quality onto the CDN's lightest setting", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { quality: 80 }).url).toBe(
      "https://ucarecdn.com/a1b2/-/quality/lightest/",
    );
  });

  it("reports back the dimensions and format it was asked for", async () => {
    const provider = await initialized();

    expect(provider.getUrl("a1b2", { width: 320, height: 240, format: "avif" })).toEqual({
      url: "https://ucarecdn.com/a1b2/-/scale_crop/320x240/center/-/format/avif/",
      width: 320,
      height: 240,
      format: "avif",
    });
  });
});

describe("uploadcare delete", () => {
  it("deletes the asset at its own signed URI", async () => {
    const calls = stubFetch(() => new Response(null, { status: 204 }));
    const provider = await initialized();

    await provider.delete("a1b2");

    expect(calls[0].url).toBe("https://api.uploadcare.com/files/a1b2/");
    expect(calls[0].init.method).toBe("DELETE");
  });

  it("reports the status and body when the delete is rejected", async () => {
    stubFetch(() => new Response("not found", { status: 404 }));
    const provider = await initialized();

    await expect(provider.delete("missing")).rejects.toThrow(
      "Uploadcare delete failed (404): not found",
    );
  });
});

describe("uploadcare list", () => {
  it("requests an unfiltered page when no options are given", async () => {
    const calls = stubFetch(() => json({ results: [] }));
    const provider = await initialized();

    const result = await provider.list();

    expect(calls[0].url).toBe("https://api.uploadcare.com/files/?");
    expect(result).toEqual({ assets: [], nextCursor: undefined });
  });

  it("maps each result onto a media asset", async () => {
    stubFetch(() =>
      json({
        results: [
          {
            uuid: "a1b2",
            original_filename: "beach.jpg",
            mime_type: "image/jpeg",
            size: 4096,
            datetime_uploaded: "2024-01-02T03:04:05.000Z",
          },
          { uuid: "c3d4", original_filename: "hills.png", mime_type: "image/png", size: 512 },
        ],
        next: null,
      }),
    );
    const provider = await initialized();

    const result = await provider.list();

    expect(result.assets).toEqual([
      {
        id: "a1b2",
        filename: "beach.jpg",
        contentType: "image/jpeg",
        size: 4096,
        createdAt: new Date("2024-01-02T03:04:05.000Z"),
      },
      {
        id: "c3d4",
        filename: "hills.png",
        contentType: "image/png",
        size: 512,
        createdAt: undefined,
      },
    ]);
    expect(result.nextCursor).toBeUndefined();
  });

  it("offers a cursor only while the API reports a further page", async () => {
    stubFetch(() => json({ results: [{ uuid: "a1b2" }, { uuid: "c3d4" }], next: "https://next" }));
    const provider = await initialized();

    const result = await provider.list({ maxResults: 2 });

    // The cursor is the row count of the page just returned, and `list` sends a
    // cursor back as `offset`.
    expect(result.nextCursor).toBe("2");
  });

  it("counts an absent results array as an empty page behind that cursor", async () => {
    stubFetch(() => json({ next: "https://next" }));
    const provider = await initialized();

    const result = await provider.list();

    expect(result.assets).toEqual([]);
    expect(result.nextCursor).toBe("0");
  });

  it("reports the status and body when the list is rejected", async () => {
    stubFetch(() => new Response("throttled", { status: 429 }));
    const provider = await initialized();

    await expect(provider.list()).rejects.toThrow("Uploadcare list failed (429): throttled");
  });
});

describe("uploadcare close", () => {
  it("drops the credentials, so a later call refuses rather than signs", async () => {
    const provider = await initialized();

    await provider.close();

    await expect(provider.list()).rejects.toThrow(/not initialized/);
  });
});
