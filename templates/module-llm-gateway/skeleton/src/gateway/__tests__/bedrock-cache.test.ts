import { describe, it, expect } from "vitest";
import { readBedrockCacheTokens, bedrockCacheKinds } from "../providers/bedrock-cache.js";

describe("readBedrockCacheTokens", () => {
  it("reads cache tokens off a Converse usage block", () => {
    expect(
      readBedrockCacheTokens({ cacheReadInputTokens: 120, cacheWriteInputTokens: 30 }),
    ).toEqual({ cacheReadTokens: 120, cacheWriteTokens: 30 });
  });

  it("defaults to zero when caching isn't in play", () => {
    expect(readBedrockCacheTokens(undefined)).toEqual({
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(readBedrockCacheTokens({})).toEqual({ cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});

describe("bedrockCacheKinds", () => {
  it("a cache read is a hit", () => {
    expect(bedrockCacheKinds(120, 0)).toEqual(["hit"]);
  });

  it("a cache write seeds the prefix", () => {
    expect(bedrockCacheKinds(0, 30)).toEqual(["write"]);
  });

  it("a call that reads and writes emits both", () => {
    expect(bedrockCacheKinds(120, 30)).toEqual(["hit", "write"]);
  });

  it("neither is a miss", () => {
    expect(bedrockCacheKinds(0, 0)).toEqual(["miss"]);
  });
});
