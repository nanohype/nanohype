/**
 * End-to-end tests for the pipeline over real files, plus the mock vision
 * provider it routes to.
 *
 * The sibling suites cover modality detection and the registries in isolation.
 * What was untested is the part that composes them: `processFile` reading a
 * file, resolving its MIME type, picking a processor, and choosing between
 * `analyze` and `analyzeFrames`. That last choice is the one worth pinning —
 * routing a video down the single-image path costs frames silently, and the
 * result still looks well-formed.
 *
 * Real files on disk rather than mocked `fs`: the processors exist to read
 * bytes, and mocking that away would leave nothing under test.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { processFile } from "../pipeline.js";
import "../processors/index.js";
import "../providers/index.js";
import { getProcessorByMimeType } from "../processors/registry.js";
import { getProvider } from "../providers/registry.js";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>';

/**
 * A 1x1 opaque PNG, inlined.
 *
 * Small enough to read at a glance and to stay well under any configured
 * maximum dimension, so the raster path runs without the test having to
 * generate an image. Generating one would pull an image-processing library into
 * the test just to produce bytes the processor is going to re-read anyway.
 */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "multimodal-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/**
 * Config pointed at the mock provider.
 *
 * The configured default is `__LLM_PROVIDER__` — so a test must name a provider
 * explicitly rather than rely on a default that can change under it, and `mock`
 * is the one that reaches no network and needs no API key.
 */
function config() {
  process.env.LLM_PROVIDER = "mock";
  return loadConfig();
}

describe("processFile", () => {
  it("runs an image end to end and reports usage from the provider", async () => {
    const png = join(dir, "small.png");
    await writeFile(png, PNG_1X1);

    const result = await processFile(png, config());

    expect(result.source).toBe(png);
    expect(result.modality).toBe("image");
    expect(result.mimeType).toBe("image/png");
    expect(result.usage.total_tokens).toBeGreaterThan(0);
    expect(result.model).toBeTruthy();
  });

  it("handles an SVG, which bypasses raster processing entirely", async () => {
    // The `mimeType !== "image/svg+xml"` guard means sharp is never invoked
    // here. Without this case that branch is only ever taken one way, and
    // handing an SVG to sharp is the kind of thing that throws in production
    // on the one file type nobody tested.
    const svg = join(dir, "icon.svg");
    await writeFile(svg, SVG);

    const result = await processFile(svg, config());
    expect(result.modality).toBe("image");
    expect(result.mimeType).toBe("image/svg+xml");
  });

  it("rejects a path that does not exist", async () => {
    // `stat` first, so the failure names the missing file rather than
    // surfacing later as an unreadable-buffer error from a processor.
    await expect(processFile(join(dir, "nope.png"), config())).rejects.toThrow();
  });

  it("rejects a file type no processor claims", async () => {
    const bin = join(dir, "notes.txt");
    await writeFile(bin, "plain text");
    await expect(processFile(bin, config())).rejects.toThrow();
  });
});

describe("image processor", () => {
  it("leaves an image within the maximum untouched", async () => {
    const small = join(dir, "within.png");
    await writeFile(small, PNG_1X1);

    const out = await getProcessorByMimeType("image/png").process(small, "image/png");
    expect(out.metadata?.width).toBe(1);
    // Under the maximum, so the resize branch is skipped and the bytes pass
    // through untouched.
    expect(out.metadata?.processedSize).toBe(out.metadata?.originalSize);
    expect(out.base64?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("mock vision provider", () => {
  const p = getProvider("mock");

  it("returns a modality-appropriate analysis for each input kind", async () => {
    const call = (modality: "image" | "audio" | "video") =>
      p.analyze(
        { modality, mimeType: "x/y", source: "s", base64: "", metadata: {} },
        "system",
        "model",
        0,
        100,
      );

    const [image, audio, video] = await Promise.all([call("image"), call("audio"), call("video")]);

    // Three distinct payloads. A double that returned one shape for everything
    // would let a modality-routing bug pass every test that used it.
    const contents = [image.content, audio.content, video.content];
    expect(new Set(contents).size).toBe(3);
    for (const r of [image, audio, video]) {
      expect(() => JSON.parse(r.content)).not.toThrow();
      expect(r.usage.total_tokens).toBe(r.usage.input_tokens + r.usage.output_tokens);
    }
  });

  it("scales frame analysis with the number of frames given", async () => {
    const two = await p.analyzeFrames(["a", "b"], "system", "model", 0, 100);
    const six = await p.analyzeFrames(["a", "b", "c", "d", "e", "f"], "system", "model", 0, 100);

    expect(JSON.parse(two.content).frames_analyzed).toBe(2);
    expect(JSON.parse(six.content).frames_analyzed).toBe(6);
    // Token cost has to move with frame count, or a cost estimate built on
    // this double is meaningless for the one modality that is expensive.
    expect(six.usage.input_tokens).toBeGreaterThan(two.usage.input_tokens);
  });

  it("does not mutate its shared fixture between calls", async () => {
    // The provider spreads module-level constants. A missed spread would make
    // the second call inherit the first call's frame count.
    await p.analyzeFrames(["a", "b", "c"], "system", "model", 0, 100);
    const after = await p.analyzeFrames(["a"], "system", "model", 0, 100);
    expect(JSON.parse(after.content).frames_analyzed).toBe(1);
  });
});
