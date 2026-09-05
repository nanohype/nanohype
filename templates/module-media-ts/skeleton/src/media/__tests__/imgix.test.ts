import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
// Importing the provider registers the "imgix" factory. The barrel is not
// needed here: nothing in this file resolves a provider other than imgix.
import { getResponsiveSrcSet } from "../providers/imgix.js";
import { getProvider } from "../providers/registry.js";
import type { FitMode, MediaConfig, MediaFormat } from "../types.js";

// ── imgix provider ────────────────────────────────────────────────
//
// imgix delivers transforms through the URL, so everything the adapter
// produces is a string the CDN parses. Two published specs fix it: the
// rendering API fixes the parameter names and the `fit` vocabulary, and the
// secure-URL scheme fixes the signature and its position. These assertions
// are pinned against those, not against what the adapter emits.
//
//   https://docs.imgix.com/apis/rendering
//   https://github.com/imgix/imgix-blueprint#securing-urls
//
// The signature's known-answer vector is in signing.test.ts. What is here is
// the surrounding behaviour: refusing to start without credentials, the
// environment fallback, the transform mapping, and srcset generation.

const SOURCE = "demo";
const TOKEN = "FOO123bar";

/** The signature imgix computes for a signed path: md5(token + pathWithQuery). */
function signature(pathWithQuery: string, token: string = TOKEN): string {
  return createHash("md5")
    .update(token + pathWithQuery)
    .digest("hex");
}

async function imgix(cfg: MediaConfig = { source: SOURCE, token: TOKEN }) {
  const provider = getProvider("imgix");
  await provider.init(cfg);
  return provider;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("imgix initialization", () => {
  // The token is the only thing standing between a public URL and an
  // attacker-controlled transform on the account's own domain, so a provider
  // that starts without one is worse than a provider that fails to start:
  // every URL it emits carries a signature over the empty string and imgix
  // rejects them all, at delivery time rather than at boot.
  it("refuses to start without a token", async () => {
    vi.stubEnv("IMGIX_TOKEN", undefined);
    const provider = getProvider("imgix");

    await expect(provider.init({ source: SOURCE })).rejects.toThrow(/source and token/);
    // A rejected init must also leave nothing configured, or the next getUrl
    // signs with whatever partial credentials were stored.
    expect(() => provider.getUrl("users/1.png")).toThrow(/not initialized/);
  });

  it("refuses to start without a source", async () => {
    vi.stubEnv("IMGIX_SOURCE", undefined);
    const provider = getProvider("imgix");

    await expect(provider.init({ token: TOKEN })).rejects.toThrow(/source and token/);
    expect(() => provider.getUrl("users/1.png")).toThrow(/not initialized/);
  });

  it("refuses to start with neither, and names the environment variables it reads", async () => {
    vi.stubEnv("IMGIX_SOURCE", undefined);
    vi.stubEnv("IMGIX_TOKEN", undefined);

    await expect(getProvider("imgix").init({})).rejects.toThrow(/IMGIX_SOURCE, IMGIX_TOKEN/);
  });

  it("falls back to IMGIX_SOURCE and IMGIX_TOKEN when the config omits them", async () => {
    vi.stubEnv("IMGIX_SOURCE", "env-source");
    vi.stubEnv("IMGIX_TOKEN", "env-token");

    const url = new URL((await imgix({})).getUrl("users/1.png").url);

    expect(url.host).toBe("env-source.imgix.net");
    expect(url.searchParams.get("s")).toBe(signature("/users/1.png", "env-token"));
  });

  it("prefers the config over the environment", async () => {
    vi.stubEnv("IMGIX_SOURCE", "env-source");
    vi.stubEnv("IMGIX_TOKEN", "env-token");

    const url = new URL((await imgix()).getUrl("users/1.png").url);

    expect(url.host).toBe(`${SOURCE}.imgix.net`);
    expect(url.searchParams.get("s")).toBe(signature("/users/1.png"));
    expect(url.searchParams.get("s")).not.toBe(signature("/users/1.png", "env-token"));
  });

  it("refuses to build a URL before init", () => {
    expect(() => getProvider("imgix").getUrl("users/1.png")).toThrow(/not initialized/);
  });

  it("refuses to build a URL after close, so a closed instance cannot sign", async () => {
    const provider = await imgix();
    await provider.close();

    expect(() => provider.getUrl("users/1.png")).toThrow(/not initialized/);
  });

  it("gives each instance its own configuration", async () => {
    const one = await imgix();
    const other = await imgix({ source: "other", token: "other-token" });

    expect(new URL(one.getUrl("users/1.png").url).host).toBe(`${SOURCE}.imgix.net`);
    expect(new URL(other.getUrl("users/1.png").url).host).toBe("other.imgix.net");
  });

  it("registers under the name the registry resolves", () => {
    expect(getProvider("imgix").name).toBe("imgix");
  });
});

describe("imgix delivery URLs", () => {
  it("emits an unmodified asset with the signature as the only parameter", async () => {
    const provider = await imgix();

    const { url } = provider.getUrl("users/1.png");

    expect(url).toBe(`https://${SOURCE}.imgix.net/users/1.png?s=${signature("/users/1.png")}`);
  });

  it("treats an empty transform set as no transform", async () => {
    const provider = await imgix();

    const url = new URL(provider.getUrl("users/1.png", {}).url);

    expect([...url.searchParams.keys()]).toEqual(["s"]);
  });

  it("maps width and height to the rendering API's w and h", async () => {
    const provider = await imgix();

    const url = new URL(provider.getUrl("users/1.png", { width: 400, height: 300 }).url);

    expect(url.searchParams.get("w")).toBe("400");
    expect(url.searchParams.get("h")).toBe("300");
  });

  it.each<[FitMode, string]>([
    ["cover", "crop"],
    ["contain", "clip"],
    ["fill", "fill"],
    ["scale", "scale"],
  ])("maps fit %s to the rendering API's %s", async (fit, expected) => {
    const provider = await imgix();

    const url = new URL(provider.getUrl("users/1.png", { fit }).url);

    expect(url.searchParams.get("fit")).toBe(expected);
  });

  it("falls back to crop for a fit value the rendering API does not define", async () => {
    const provider = await imgix();

    const url = new URL(provider.getUrl("users/1.png", { fit: "unsupported" as FitMode }).url);

    expect(url.searchParams.get("fit")).toBe("crop");
  });

  it.each<MediaFormat>(["webp", "avif", "jpeg", "png"])(
    "requests an explicit format with fm=%s",
    async (format) => {
      const provider = await imgix();

      const url = new URL(provider.getUrl("users/1.png", { format }).url);

      expect(url.searchParams.get("fm")).toBe(format);
      expect(url.searchParams.has("auto")).toBe(false);
    },
  );

  it("requests content negotiation with auto=format, which fm cannot express", async () => {
    const provider = await imgix();

    const url = new URL(provider.getUrl("users/1.png", { format: "auto" }).url);

    expect(url.searchParams.get("auto")).toBe("format");
    // fm=auto is not a rendering API value; sending it serves a broken image.
    expect(url.searchParams.has("fm")).toBe(false);
  });

  it("maps quality to q", async () => {
    const provider = await imgix();

    const url = new URL(provider.getUrl("users/1.png", { quality: 65 }).url);

    expect(url.searchParams.get("q")).toBe("65");
  });

  it("signs the query string it emits, so every parameter is covered", async () => {
    const provider = await imgix();
    const transforms = {
      width: 400,
      height: 300,
      fit: "contain" as FitMode,
      format: "webp" as MediaFormat,
      quality: 65,
    };

    const { url } = provider.getUrl("users/1.png", transforms);
    const parsed = new URL(url);
    const query = url.slice(url.indexOf("?"), url.indexOf("&s="));

    expect(query).toBe("?w=400&h=300&fit=clip&fm=webp&q=65");
    expect(parsed.searchParams.get("s")).toBe(signature(`/users/1.png${query}`));
  });

  it("echoes the transform dimensions and format back to the caller", async () => {
    const provider = await imgix();

    expect(
      provider.getUrl("users/1.png", { width: 400, height: 300, format: "avif" }),
    ).toMatchObject({ width: 400, height: 300, format: "avif" });
  });

  it("reports no dimensions or format when nothing was transformed", async () => {
    const provider = await imgix();

    const delivery = provider.getUrl("users/1.png");

    expect(delivery.width).toBeUndefined();
    expect(delivery.height).toBeUndefined();
    expect(delivery.format).toBeUndefined();
  });
});

describe("imgix unsupported operations", () => {
  // imgix renders from a source someone else writes to. Each of these has to
  // fail loudly rather than resolve, so a caller cannot believe an asset was
  // stored or removed.
  it("rejects uploads and points at the alternative", async () => {
    await expect(getProvider("imgix").upload(Buffer.from("x"))).rejects.toThrow(
      /does not support uploads/,
    );
  });

  it("rejects deletes", async () => {
    await expect(getProvider("imgix").delete("users/1.png")).rejects.toThrow(
      /does not support deletes/,
    );
  });

  it("rejects listing", async () => {
    await expect(getProvider("imgix").list()).rejects.toThrow(/does not support listing/);
  });
});

describe("getResponsiveSrcSet", () => {
  /** Split a srcset attribute into its candidates and width descriptors. */
  function candidates(srcset: string): Array<{ url: URL; descriptor: string }> {
    return srcset.split(", ").map((entry) => {
      const [url, descriptor] = entry.split(" ");
      return { url: new URL(url), descriptor };
    });
  }

  it("defaults to the documented responsive widths", () => {
    const srcset = getResponsiveSrcSet(SOURCE, TOKEN, "users/1.png");

    expect(candidates(srcset).map((c) => c.descriptor)).toEqual([
      "320w",
      "640w",
      "960w",
      "1280w",
      "1920w",
    ]);
  });

  it("uses the widths it is given, in the order given", () => {
    const srcset = getResponsiveSrcSet(SOURCE, TOKEN, "users/1.png", [100, 200]);

    expect(candidates(srcset).map((c) => c.descriptor)).toEqual(["100w", "200w"]);
    expect(candidates(srcset).map((c) => c.url.searchParams.get("w"))).toEqual(["100", "200"]);
  });

  it("produces an empty attribute for an empty width list", () => {
    expect(getResponsiveSrcSet(SOURCE, TOKEN, "users/1.png", [])).toBe("");
  });

  it("keeps the signature last in every candidate", () => {
    const srcset = getResponsiveSrcSet(SOURCE, TOKEN, "users/1.png", [320]);

    // `s` covers everything before it, so a parameter appended after it is
    // unsigned and imgix rejects the URL.
    expect(srcset).toBe(
      `https://${SOURCE}.imgix.net/users/1.png?w=320&s=${signature("/users/1.png?w=320")} 320w`,
    );
  });

  it("carries only the width when no base transforms are given", () => {
    const [only] = candidates(getResponsiveSrcSet(SOURCE, TOKEN, "users/1.png", [320]));

    expect([...only.url.searchParams.keys()]).toEqual(["w", "s"]);
  });

  it("applies the base transforms to every candidate", () => {
    const srcset = getResponsiveSrcSet(SOURCE, TOKEN, "users/1.png", [320, 640], {
      height: 240,
      fit: "cover",
      format: "webp",
      quality: 70,
    });

    for (const { url } of candidates(srcset)) {
      expect(url.searchParams.get("h")).toBe("240");
      expect(url.searchParams.get("fit")).toBe("crop");
      expect(url.searchParams.get("fm")).toBe("webp");
      expect(url.searchParams.get("q")).toBe("70");
    }
  });

  it("requests content negotiation per candidate with auto=format", () => {
    const [only] = candidates(
      getResponsiveSrcSet(SOURCE, TOKEN, "users/1.png", [320], { format: "auto" }),
    );

    expect(only.url.searchParams.get("auto")).toBe("format");
    expect(only.url.searchParams.has("fm")).toBe(false);
  });

  it("falls back to crop for a fit value the rendering API does not define", () => {
    const [only] = candidates(
      getResponsiveSrcSet(SOURCE, TOKEN, "users/1.png", [320], {
        fit: "unsupported" as FitMode,
      }),
    );

    expect(only.url.searchParams.get("fit")).toBe("crop");
  });

  it("signs each candidate over its own width, so candidates are not interchangeable", () => {
    const srcset = getResponsiveSrcSet(SOURCE, TOKEN, "users/1.png", [320, 640]);
    const [first, second] = candidates(srcset);

    expect(first.url.searchParams.get("s")).toBe(signature("/users/1.png?w=320"));
    expect(second.url.searchParams.get("s")).toBe(signature("/users/1.png?w=640"));
    expect(first.url.searchParams.get("s")).not.toBe(second.url.searchParams.get("s"));
  });

  it("signs with the token it is given", () => {
    const [only] = candidates(getResponsiveSrcSet(SOURCE, "other-token", "users/1.png", [320]));

    expect(only.url.searchParams.get("s")).toBe(signature("/users/1.png?w=320", "other-token"));
  });
});
