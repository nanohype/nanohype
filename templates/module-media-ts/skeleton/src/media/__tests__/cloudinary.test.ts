import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// For its side effect: the provider self-registers with the registry on import.
import "../providers/cloudinary.js";
import { getProvider } from "../providers/registry.js";
import type { MediaProvider } from "../providers/types.js";
import type { FitMode } from "../types.js";

// ── Cloudinary provider tests ─────────────────────────────────────
//
// The adapter signs every mutating call with the account's API secret. A
// signature built from the wrong key, over the wrong parameter set, or over a
// timestamp other than the one on the wire is answered with a 401 that names
// none of those causes, so each is pinned here rather than left to a live
// account to discover.
//
// Cloudinary's construction is published: take every signed parameter, sort by
// key, join as `key=value` with `&`, append the API secret, hash. `file`,
// `api_key`, `cloud_name` and `resource_type` are not signed. The digest may be
// SHA-1 or SHA-256 — the adapter signs SHA-256, so that is what these compute.
//
//   https://cloudinary.com/documentation/authentication_signatures
//
// Everything the adapter reaches for outside the process is stubbed: `fetch`
// never leaves the test, and `Date.now` steps a whole second per call so that a
// timestamp read twice cannot silently agree with itself.

const CLOUD_NAME = "demo-cloud";
const API_KEY = "874837483274837";
const API_SECRET = "a-secret-that-is-not-the-key";
const CLOCK_START_MS = 1_700_000_000_000;

/**
 * Cloudinary's published construction, recomputed here rather than imported, so
 * that the assertions do not compare the implementation against itself.
 *
 * This is a request signature, not stored authentication material. The account
 * recomputes the same digest over the parameters it receives and compares, so
 * the algorithm is whatever Cloudinary validates — a password-hashing function
 * here would produce a value it rejects, and there is nothing being stored for
 * one to protect. The secret is a fixture, and the parameters change per
 * request, which is what a signature is for.
 */
function cloudinarySignature(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha256")
    .update(sorted + secret)
    .digest("hex");
}

interface FetchCall {
  url: string;
  init: RequestInit;
}

/** Replaces `fetch` with a recorder that answers from `respond`. */
function stubFetch(respond: () => Response): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return respond();
  });
  return calls;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** The string-valued fields of a multipart body, keyed by field name. */
function textFields(body: RequestInit["body"]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of (body as FormData).entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

/**
 * The parameters a multipart body offers Cloudinary for verification: every
 * text field except `api_key` and the digest itself, which the published
 * construction leaves unsigned. `file` is a Blob, so it drops out with them.
 */
function wireSignedParams(body: RequestInit["body"]): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of (body as FormData).entries()) {
    if (typeof value !== "string") continue;
    if (key === "api_key" || key === "signature") continue;
    params[key] = value;
  }
  return params;
}

/** Every field name a multipart body carries, sorted, repeats included. */
function fieldNames(body: RequestInit["body"]): string[] {
  return [...(body as FormData).keys()].sort();
}

/**
 * Pins the agreement Cloudinary verifies on a signed call: the account
 * recomputes the digest from the parameters it receives, so the parameters on
 * the wire and the parameters inside the hash are one set, named `signed`.
 *
 * A parameter sent but not signed is one an intermediary may change. A
 * parameter signed but withheld -- or sent twice, or under another name --
 * yields a digest the account cannot reproduce. Either way the account answers
 * a rejection that names no field, so the property is asserted per signed call
 * rather than left to one of them to stand for the rest.
 */
function expectSignedParamsOnWire(body: RequestInit["body"], signed: string[]): void {
  // Repeats first, and from the key list rather than the record: a multipart
  // body may carry one name twice and a Record cannot hold that, so a check
  // built on the record alone reads a duplicate as a single field.
  const names = fieldNames(body);
  expect(names.filter((name) => names.indexOf(name) !== names.lastIndexOf(name))).toEqual([]);
  expect(Object.keys(wireSignedParams(body)).sort()).toEqual([...signed].sort());
  expect(cloudinarySignature(wireSignedParams(body), API_SECRET)).toBe(textFields(body).signature);
}

const UPLOAD_RESPONSE = {
  public_id: "campaigns/hero-shot",
  original_filename: "hero-shot",
  format: "png",
  bytes: 20_480,
  width: 1600,
  height: 900,
  created_at: "2024-03-01T10:20:30Z",
  version: 1_709_289_630,
  etag: "d41d8cd98f00b204e9800998ecf8427e",
};

/**
 * Every call the adapter signs, paired with options that exercise the
 * parameters it signs and with the names those parameters take on the wire.
 * `api_key` and `signature` are absent because the published construction
 * leaves them unsigned, and `file` because it is a Blob rather than a text
 * field.
 */
const SIGNED_CALLS: {
  method: string;
  respond: () => Response;
  send: (provider: MediaProvider) => Promise<unknown>;
  signed: string[];
}[] = [
  {
    method: "upload",
    respond: () => json(UPLOAD_RESPONSE),
    send: (provider) =>
      provider.upload(Buffer.from("image bytes"), {
        filename: "hero-shot",
        folder: "campaigns",
        eagerTransforms: [{ width: 200, fit: "cover" }],
      }),
    signed: ["eager", "folder", "public_id", "timestamp"],
  },
  {
    method: "delete",
    respond: () => new Response(null, { status: 200 }),
    send: (provider) => provider.delete("campaigns/hero-shot"),
    signed: ["public_id", "timestamp"],
  },
];

describe("cloudinary media provider", () => {
  /** Every value the stubbed clock has handed out, oldest first. */
  let clockReadings: number[];

  beforeEach(() => {
    clockReadings = [];
    // A stepping clock: reading the wall clock twice within one call produces
    // two different unix seconds, so signing one and sending the other cannot
    // pass by coincidence.
    vi.spyOn(Date, "now").mockImplementation(() => {
      const reading = CLOCK_START_MS + clockReadings.length * 1000;
      clockReadings.push(reading);
      return reading;
    });
    // The adapter falls back to the environment, so the environment is emptied
    // for every test that does not deliberately populate it.
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", undefined);
    vi.stubEnv("CLOUDINARY_API_KEY", undefined);
    vi.stubEnv("CLOUDINARY_API_SECRET", undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function initialized(): Promise<MediaProvider> {
    const provider = getProvider("cloudinary");
    await provider.init({ cloudName: CLOUD_NAME, apiKey: API_KEY, apiSecret: API_SECRET });
    return provider;
  }

  describe("init", () => {
    it("names itself for the registry", () => {
      expect(getProvider("cloudinary").name).toBe("cloudinary");
    });

    it("refuses to start without a cloud name", async () => {
      const provider = getProvider("cloudinary");
      await expect(provider.init({ apiKey: API_KEY, apiSecret: API_SECRET })).rejects.toThrow(
        /requires cloudName, apiKey, and apiSecret/,
      );
    });

    it("refuses to start without an api key", async () => {
      const provider = getProvider("cloudinary");
      await expect(provider.init({ cloudName: CLOUD_NAME, apiSecret: API_SECRET })).rejects.toThrow(
        /requires cloudName, apiKey, and apiSecret/,
      );
    });

    it("refuses to start without an api secret", async () => {
      const provider = getProvider("cloudinary");
      await expect(provider.init({ cloudName: CLOUD_NAME, apiKey: API_KEY })).rejects.toThrow(
        /requires cloudName, apiKey, and apiSecret/,
      );
    });

    it("falls back to the documented environment variables", async () => {
      vi.stubEnv("CLOUDINARY_CLOUD_NAME", "env-cloud");
      vi.stubEnv("CLOUDINARY_API_KEY", "env-key");
      vi.stubEnv("CLOUDINARY_API_SECRET", "env-secret");
      const calls = stubFetch(() => new Response(null, { status: 200 }));

      const provider = getProvider("cloudinary");
      await provider.init({});
      await provider.delete("from-env");

      expect(provider.getUrl("from-env").url).toContain("/env-cloud/");
      const fields = textFields(calls[0].init.body);
      expect(fields.api_key).toBe("env-key");
      expect(fields.signature).toBe(
        cloudinarySignature({ public_id: "from-env", timestamp: fields.timestamp }, "env-secret"),
      );
    });

    it("prefers explicit configuration over the environment", async () => {
      vi.stubEnv("CLOUDINARY_CLOUD_NAME", "env-cloud");
      vi.stubEnv("CLOUDINARY_API_KEY", "env-key");
      vi.stubEnv("CLOUDINARY_API_SECRET", "env-secret");
      const calls = stubFetch(() => new Response(null, { status: 200 }));

      const provider = await initialized();
      await provider.delete("from-config");

      expect(provider.getUrl("from-config").url).toContain(`/${CLOUD_NAME}/`);
      const fields = textFields(calls[0].init.body);
      expect(fields.api_key).toBe(API_KEY);
      expect(fields.signature).toBe(
        cloudinarySignature({ public_id: "from-config", timestamp: fields.timestamp }, API_SECRET),
      );
    });
  });

  describe("before init", () => {
    it("refuses every operation until init() has run", async () => {
      const provider = getProvider("cloudinary");

      expect(() => provider.getUrl("anything")).toThrow(/not initialized/);
      await expect(provider.upload(Buffer.from("x"))).rejects.toThrow(/not initialized/);
      await expect(provider.delete("anything")).rejects.toThrow(/not initialized/);
      await expect(provider.list()).rejects.toThrow(/not initialized/);
    });

    it("returns to that state after close()", async () => {
      const provider = await initialized();
      expect(provider.getUrl("anything").url).toContain(CLOUD_NAME);

      await provider.close();

      expect(() => provider.getUrl("anything")).toThrow(/not initialized/);
    });
  });

  describe("upload", () => {
    it("signs the timestamp it puts on the wire, with the api secret", async () => {
      const calls = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      const before = clockReadings.length;
      await provider.upload(Buffer.from("image bytes"));

      // One reading of the clock, sent verbatim and signed verbatim. A second
      // reading would be a second unix second under this stub.
      const readings = clockReadings.slice(before);
      expect(readings).toHaveLength(1);
      const fields = textFields(calls[0].init.body);
      expect(fields.timestamp).toBe(String(Math.floor(readings[0] / 1000)));
      expect(fields.signature).toBe(
        cloudinarySignature({ timestamp: fields.timestamp }, API_SECRET),
      );
      // Signing any timestamp other than the one on the wire produces a digest
      // the account rejects.
      expect(fields.signature).not.toBe(
        cloudinarySignature({ timestamp: String(Number(fields.timestamp) + 1) }, API_SECRET),
      );
    });

    it("signs with the api secret, never the public api key", async () => {
      const calls = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      await provider.upload(Buffer.from("image bytes"));

      const fields = textFields(calls[0].init.body);
      expect(fields.signature).not.toBe(
        cloudinarySignature({ timestamp: fields.timestamp }, API_KEY),
      );
      expect(fields.api_key).toBe(API_KEY);
    });

    it("signs every upload parameter, not only the timestamp", async () => {
      const calls = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      await provider.upload(Buffer.from("image bytes"), {
        filename: "hero-shot",
        folder: "campaigns",
        eagerTransforms: [{ width: 200, fit: "cover" }],
      });

      const fields = textFields(calls[0].init.body);
      const signed = {
        eager: "w_200,c_fill",
        folder: "campaigns",
        public_id: "hero-shot",
        timestamp: fields.timestamp,
      };
      expect(fields.signature).toBe(cloudinarySignature(signed, API_SECRET));

      // Every one of those parameters has to be inside the hashed string: a
      // parameter sent but not signed is a parameter an intermediary can change.
      for (const dropped of ["eager", "folder", "public_id"]) {
        const partial: Record<string, string> = { ...signed };
        delete partial[dropped];
        expect(fields.signature).not.toBe(cloudinarySignature(partial, API_SECRET));
      }
    });

    it("puts every signed parameter on the wire under its own name", async () => {
      const calls = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      await provider.upload(Buffer.from("image bytes"), {
        filename: "hero-shot",
        folder: "campaigns",
        eagerTransforms: [{ width: 200, fit: "cover" }],
      });

      // The agreement, and then the complete multipart shape around it: `file`,
      // `api_key` and `signature` are the fields Cloudinary does not verify, so
      // this pins that no fourth one appears beside them, and that the values
      // reaching the wire are the ones the options asked for.
      const body = calls[0].init.body;
      expectSignedParamsOnWire(body, ["eager", "folder", "public_id", "timestamp"]);
      expect(fieldNames(body)).toEqual([
        "api_key",
        "eager",
        "file",
        "folder",
        "public_id",
        "signature",
        "timestamp",
      ]);
      expect(textFields(body)).toMatchObject({
        eager: "w_200,c_fill",
        folder: "campaigns",
        public_id: "hero-shot",
      });
    });

    it("leaves file and api_key out of the signed parameters, as the spec requires", async () => {
      const calls = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      await provider.upload(Buffer.from("image bytes"), { filename: "hero-shot" });

      const fields = textFields(calls[0].init.body);
      const signed = { public_id: "hero-shot", timestamp: fields.timestamp };
      expect(fields.signature).toBe(cloudinarySignature(signed, API_SECRET));
      expect(fields.signature).not.toBe(
        cloudinarySignature({ ...signed, api_key: API_KEY }, API_SECRET),
      );
    });

    it("posts a multipart body to the cloud's upload endpoint", async () => {
      const calls = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      await provider.upload(Buffer.from("image bytes"), { filename: "hero-shot" });

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
      expect(calls[0].init.method).toBe("POST");
      expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
      const body = calls[0].init.body as FormData;
      expect(body.get("file")).toBeInstanceOf(Blob);
      // The upload carries no Content-Type of its own. `fetch` derives
      // `multipart/form-data` and the boundary from the FormData body; a header
      // set by hand omits that boundary, and the parts arrive unparseable —
      // including the signature, so the account answers 401.
      expect(calls[0].init.headers).toBeUndefined();
    });

    it("sends the payload under the requested filename, or a default", async () => {
      const named = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();
      await provider.upload(Buffer.from("image bytes"), { filename: "hero-shot" });
      expect((named[0].init.body as FormData).get("file")).toHaveProperty("name", "hero-shot");

      vi.unstubAllGlobals();
      const anonymous = stubFetch(() => json(UPLOAD_RESPONSE));
      await provider.upload(Buffer.from("image bytes"));
      expect((anonymous[0].init.body as FormData).get("file")).toHaveProperty("name", "upload");
    });

    it("joins eager transforms with a pipe", async () => {
      const calls = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      await provider.upload(Buffer.from("image bytes"), {
        eagerTransforms: [
          { width: 200, height: 100, fit: "contain", format: "webp", quality: 80 },
          { format: "auto" },
        ],
      });

      expect(textFields(calls[0].init.body).eager).toBe("w_200,h_100,c_fit,f_webp,q_80|f_auto");
    });

    it("omits eager entirely when no eager transforms are requested", async () => {
      const calls = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      await provider.upload(Buffer.from("image bytes"), { eagerTransforms: [] });

      expect(textFields(calls[0].init.body)).not.toHaveProperty("eager");
    });

    it("maps the upload response onto a MediaAsset", async () => {
      stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      const asset = await provider.upload(Buffer.from("image bytes"));

      expect(asset).toEqual({
        id: "campaigns/hero-shot",
        filename: "hero-shot",
        contentType: "image/png",
        size: 20_480,
        width: 1600,
        height: 900,
        createdAt: new Date("2024-03-01T10:20:30Z"),
        metadata: { version: 1_709_289_630, etag: "d41d8cd98f00b204e9800998ecf8427e" },
      });
    });

    it("surfaces the status and body of a rejected upload", async () => {
      stubFetch(() => new Response("Invalid Signature", { status: 401 }));
      const provider = await initialized();

      await expect(provider.upload(Buffer.from("image bytes"))).rejects.toThrow(
        "Cloudinary upload failed (401): Invalid Signature",
      );
    });
  });

  describe("getUrl", () => {
    it("addresses the delivery host for the configured cloud", async () => {
      const provider = await initialized();

      expect(provider.getUrl("campaigns/hero-shot")).toEqual({
        url: `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/campaigns/hero-shot`,
        width: undefined,
        height: undefined,
        format: undefined,
      });
    });

    it("inserts the transform segment and the format extension", async () => {
      const provider = await initialized();

      expect(provider.getUrl("hero-shot", { width: 200, height: 100, quality: 80 })).toEqual({
        url: `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/w_200,h_100,q_80/hero-shot`,
        width: 200,
        height: 100,
        format: undefined,
      });
      expect(provider.getUrl("hero-shot", { format: "webp" }).url).toBe(
        `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_webp/hero-shot.webp`,
      );
    });

    it("asks the CDN to negotiate the format rather than naming an extension", async () => {
      const provider = await initialized();

      const delivery = provider.getUrl("hero-shot", { format: "auto" });

      expect(delivery.url).toBe(
        `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto/hero-shot`,
      );
      expect(delivery.format).toBe("auto");
    });

    it("emits no transform segment for an empty transform set", async () => {
      const provider = await initialized();

      expect(provider.getUrl("hero-shot", {}).url).toBe(
        `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/hero-shot`,
      );
    });

    it("maps every fit mode to its crop parameter", async () => {
      const provider = await initialized();
      const crops: Record<FitMode, string> = {
        cover: "c_fill",
        contain: "c_fit",
        fill: "c_lfill",
        scale: "c_scale",
      };

      for (const [fit, crop] of Object.entries(crops)) {
        expect(provider.getUrl("hero-shot", { fit: fit as FitMode }).url).toContain(`/${crop}/`);
      }
    });

    it("crops rather than distorting when the fit mode is unrecognized", async () => {
      const provider = await initialized();

      const fit = "letterbox" as unknown as FitMode;
      expect(provider.getUrl("hero-shot", { fit }).url).toContain("/c_fill/");
    });
  });

  describe("delete", () => {
    it("signs the public id and the timestamp it sends, with the api secret", async () => {
      const calls = stubFetch(() => new Response(null, { status: 200 }));
      const provider = await initialized();

      const before = clockReadings.length;
      await provider.delete("campaigns/hero-shot");

      const readings = clockReadings.slice(before);
      expect(readings).toHaveLength(1);
      const fields = textFields(calls[0].init.body);
      expect(fields.timestamp).toBe(String(Math.floor(readings[0] / 1000)));
      expect(fields.public_id).toBe("campaigns/hero-shot");
      const signed = { public_id: "campaigns/hero-shot", timestamp: fields.timestamp };
      expect(fields.signature).toBe(cloudinarySignature(signed, API_SECRET));
      expect(fields.signature).not.toBe(cloudinarySignature(signed, API_KEY));
      expect(fields.signature).not.toBe(
        cloudinarySignature({ timestamp: fields.timestamp }, API_SECRET),
      );
      expect(fields.signature).not.toBe(
        cloudinarySignature(
          { ...signed, timestamp: String(Number(fields.timestamp) + 1) },
          API_SECRET,
        ),
      );
    });

    it("posts to the destroy endpoint for the configured cloud", async () => {
      const calls = stubFetch(() => new Response(null, { status: 200 }));
      const provider = await initialized();

      await provider.delete("hero-shot");

      expect(calls[0].url).toBe(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`);
      expect(calls[0].init.method).toBe("POST");
      expect(textFields(calls[0].init.body).api_key).toBe(API_KEY);
      expect(calls[0].init.headers).toBeUndefined();
    });

    it("surfaces the status and body of a rejected delete", async () => {
      stubFetch(() => new Response("Not Found", { status: 404 }));
      const provider = await initialized();

      await expect(provider.delete("missing")).rejects.toThrow(
        "Cloudinary delete failed (404): Not Found",
      );
    });
  });

  describe("list", () => {
    it("authenticates with the api key and secret, not the key twice", async () => {
      const calls = stubFetch(() => json({ resources: [] }));
      const provider = await initialized();

      await provider.list();

      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(
        `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64")}`,
      );
      expect(headers.Authorization).not.toBe(
        `Basic ${Buffer.from(`${API_KEY}:${API_KEY}`).toString("base64")}`,
      );
    });

    it("requests the image resources of the configured cloud with no filters", async () => {
      const calls = stubFetch(() => json({ resources: [] }));
      const provider = await initialized();

      await provider.list();

      expect(calls[0].url).toBe(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image?`);
    });

    it("translates list options into the documented query parameters", async () => {
      const calls = stubFetch(() => json({ resources: [] }));
      const provider = await initialized();

      await provider.list({ maxResults: 25, cursor: "page-two", folder: "campaigns" });

      const query = new URL(calls[0].url).searchParams;
      expect(query.get("max_results")).toBe("25");
      expect(query.get("next_cursor")).toBe("page-two");
      expect(query.get("prefix")).toBe("campaigns");
    });

    it("maps resources onto assets and carries the cursor forward", async () => {
      stubFetch(() =>
        json({
          resources: [
            {
              public_id: "campaigns/hero-shot",
              format: "webp",
              bytes: 4096,
              width: 800,
              height: 600,
              created_at: "2024-03-01T10:20:30Z",
            },
          ],
          next_cursor: "page-two",
        }),
      );
      const provider = await initialized();

      const result = await provider.list();

      expect(result.assets).toEqual([
        {
          id: "campaigns/hero-shot",
          filename: "campaigns/hero-shot",
          contentType: "image/webp",
          size: 4096,
          width: 800,
          height: 600,
          createdAt: new Date("2024-03-01T10:20:30Z"),
        },
      ]);
      expect(result.nextCursor).toBe("page-two");
    });

    it("reads an omitted resources array as an empty page with no cursor", async () => {
      stubFetch(() => json({}));
      const provider = await initialized();

      await expect(provider.list()).resolves.toEqual({ assets: [], nextCursor: undefined });
    });

    it("surfaces the status and body of a rejected list", async () => {
      stubFetch(() => new Response("Rate limited", { status: 420 }));
      const provider = await initialized();

      await expect(provider.list()).rejects.toThrow("Cloudinary list failed (420): Rate limited");
    });
  });

  describe("signed requests", () => {
    it.each(SIGNED_CALLS)(
      "$method sends every parameter it signed, and signs every parameter it sends",
      async ({ respond, send, signed }) => {
        const calls = stubFetch(respond);
        const provider = await initialized();

        await send(provider);

        expectSignedParamsOnWire(calls[0].init.body, signed);
      },
    );
  });

  describe("request deadlines", () => {
    it("bounds every call at thirty seconds and sends that signal", async () => {
      // The milliseconds handed to AbortSignal.timeout are not readable from
      // the signal it returns, so the constructor itself is the observation
      // point.
      const deadline = vi.spyOn(AbortSignal, "timeout");
      const calls = stubFetch(() => json(UPLOAD_RESPONSE));
      const provider = await initialized();

      await provider.upload(Buffer.from("image bytes"));
      await provider.delete("hero-shot");
      await provider.list();

      // One deadline per outbound call, and all three agree. A shorter one
      // aborts requests the account would have answered; five aborts in a row
      // open the circuit breaker, so the provider goes offline for callers who
      // never saw a vendor error at all.
      expect(deadline.mock.calls).toEqual([[30_000], [30_000], [30_000]]);
      // And the signal that carries that deadline is the one fetch receives,
      // rather than one built and dropped.
      expect(calls).toHaveLength(3);
      calls.forEach((call, index) => {
        expect(call.init.signal).toBe(deadline.mock.results[index].value);
      });
    });
  });
});
