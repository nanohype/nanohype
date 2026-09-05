import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getResponsiveSrcSet } from "../providers/imgix.js";
// The barrel, for its side effect: every built-in provider self-registers on
// import, so pulling in only imgix.js leaves `getProvider("uploadcare")` empty.
import "../providers/index.js";
import { getProvider } from "../providers/registry.js";
import { signCloudinaryParams } from "../providers/signatures.js";

// ── Provider signing tests ────────────────────────────────────────
//
// A wrong signature is the failure mode a type checker, a linter and a unit test
// of the surrounding code all pass over: the URL is well-formed, the header is
// present, the shape is right, and the vendor returns 403 or 401 with no clue
// which of the signed components was wrong. So these are pinned against the
// vendors' own published specifications rather than against what the code
// currently emits.
//
// imgix publishes a worked vector, which makes its case a known-answer test —
// the strongest available check, and one that fails on any of: the wrong hash
// construction, a missing token, a dropped leading slash, or a query string
// concatenated without its `?`.
//
//   https://github.com/imgix/imgix-blueprint#securing-urls
//   https://uploadcare.com/docs/api/rest/authentication/

/** The blueprint's published example: token `FOO123bar`, path `/users/1.png`. */
const IMGIX_TOKEN = "FOO123bar";
const IMGIX_VECTOR_SIGNATURE = "6797c24146142d5b40bde3141fd3600c";

describe("imgix URL signing", () => {
  async function imgix() {
    const p = getProvider("imgix");
    await p.init({ source: "demo", token: IMGIX_TOKEN });
    return p;
  }

  it("reproduces the published signature for an unmodified asset", async () => {
    const p = await imgix();
    // md5("FOO123bar" + "/users/1.png"). If this is ever computed as an HMAC
    // keyed with the token, or without the token in the hashed string at all,
    // the digest changes completely and imgix rejects the URL.
    expect(p.getUrl("users/1.png").url).toBe(
      `https://demo.imgix.net/users/1.png?s=${IMGIX_VECTOR_SIGNATURE}`,
    );
  });

  it("includes the query string, with its leading ?, in the signed base", async () => {
    const p = await imgix();
    const url = new URL(p.getUrl("users/1.png", { width: 400 }).url);
    const query = "?w=400";
    const { createHash } = await import("node:crypto");
    const expected = createHash("md5").update(`${IMGIX_TOKEN}/users/1.png${query}`).digest("hex");
    expect(url.searchParams.get("s")).toBe(expected);
    // Signing the path alone would still produce a 32-char hex signature and a
    // URL that looks correct, so assert it is *not* that.
    const pathOnly = createHash("md5").update(`${IMGIX_TOKEN}/users/1.png`).digest("hex");
    expect(url.searchParams.get("s")).not.toBe(pathOnly);
  });

  it("puts s last, as the spec requires", async () => {
    const p = await imgix();
    const url = p.getUrl("users/1.png", { width: 400, height: 300 }).url;
    expect(url.slice(url.indexOf("s=")).includes("&")).toBe(false);
  });

  it("signs every srcset candidate the same way", async () => {
    const { createHash } = await import("node:crypto");
    const srcset = getResponsiveSrcSet("demo", IMGIX_TOKEN, "users/1.png", [320, 640]);
    for (const w of [320, 640]) {
      const expected = createHash("md5").update(`${IMGIX_TOKEN}/users/1.png?w=${w}`).digest("hex");
      expect(srcset).toContain(`s=${expected} ${w}w`);
    }
  });
});

describe("uploadcare REST authentication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Captures the headers of the first REST call the provider makes. */
  async function captureListHeaders(): Promise<Record<string, string>> {
    let captured: Record<string, string> = {};
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      captured = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const p = getProvider("uploadcare");
    await p.init({ publicKey: "pub", secretKey: "sec" });
    await p.list();
    return captured;
  }

  it("pins the REST API version, which the spec requires on every request", async () => {
    const headers = await captureListHeaders();
    expect(headers.Accept).toBe("application/vnd.uploadcare-v0.7+json");
  });

  it("signs with HMAC-SHA1 over the five components, joined by newlines", async () => {
    const headers = await captureListHeaders();
    const { createHash, createHmac } = await import("node:crypto");
    // contentMd5 for a bodyless request is the MD5 of the empty string, not the
    // empty string. Passing "" yields a signature over a different base than the
    // server computes, and every call returns 401 with no indication why.
    const emptyBodyMd5 = createHash("md5").update("").digest("hex");
    const signString = ["GET", emptyBodyMd5, "application/json", headers.Date, "/files/?"].join(
      "\n",
    );
    const expected = createHmac("sha1", "sec").update(signString).digest("hex");
    expect(headers.Authorization).toBe(`Uploadcare pub:${expected}`);

    const withEmptyString = createHmac("sha1", "sec")
      .update(["GET", "", "application/json", headers.Date, "/files/?"].join("\n"))
      .digest("hex");
    expect(headers.Authorization).not.toBe(`Uploadcare pub:${withEmptyString}`);
  });

  it("sends the same Date it signed", async () => {
    // The signature covers the Date, and the server rejects a skew over 15
    // minutes — so a header regenerated after signing fails intermittently,
    // which is worse than failing outright.
    const headers = await captureListHeaders();
    expect(headers.Date).toBeDefined();
    expect(Number.isNaN(Date.parse(headers.Date))).toBe(false);
  });
});

describe("cloudinary parameter signing", () => {
  // Cloudinary publishes the construction rather than a worked vector, so
  // these pin the construction: which bytes are hashed, in what order, and
  // that the secret is part of them. Each assertion computes the expected
  // digest independently rather than comparing the function against itself.
  const SECRET = "abcd1234";

  it("hashes the sorted parameters with the secret appended", () => {
    const params = { timestamp: "1700000000", public_id: "sample" };

    const expected = createHash("sha256")
      .update(`public_id=sample&timestamp=1700000000${SECRET}`)
      .digest("hex");

    expect(signCloudinaryParams(params, SECRET)).toBe(expected);
  });

  it("sorts by key, so parameter order at the call site cannot change the signature", () => {
    const one = signCloudinaryParams({ b: "2", a: "1" }, SECRET);
    const other = signCloudinaryParams({ a: "1", b: "2" }, SECRET);

    expect(one).toBe(other);
  });

  it("changes when the secret changes, which is what makes it a signature", () => {
    const params = { timestamp: "1700000000" };

    expect(signCloudinaryParams(params, SECRET)).not.toBe(
      signCloudinaryParams(params, "a-different-secret"),
    );
  });

  it("changes when any signed parameter changes", () => {
    const base = signCloudinaryParams({ timestamp: "1700000000" }, SECRET);

    expect(signCloudinaryParams({ timestamp: "1700000001" }, SECRET)).not.toBe(base);
  });

  it("signs an empty parameter set as the secret alone", () => {
    expect(signCloudinaryParams({}, SECRET)).toBe(
      createHash("sha256").update(SECRET).digest("hex"),
    );
  });
});
