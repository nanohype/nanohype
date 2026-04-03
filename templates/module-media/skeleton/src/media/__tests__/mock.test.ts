import { describe, it, expect, beforeEach } from "vitest";
import { getProvider } from "../providers/registry.js";
import "../providers/mock.js";
import type { MediaProvider } from "../providers/types.js";

// ── Mock Provider Tests ─────────────────────────────────────────
//
// Validates upload, getUrl with transforms, delete, list, and
// pagination for the in-memory mock media provider.
//

describe("mock media provider", () => {
  let provider: MediaProvider;

  beforeEach(async () => {
    provider = getProvider("mock");
    await provider.close();
    await provider.init({});
  });

  it("creates independent instances (factory pattern)", () => {
    const a = getProvider("mock");
    const b = getProvider("mock");
    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
  });

  describe("upload", () => {
    it("uploads data and returns a MediaAsset", async () => {
      const data = Buffer.from("fake image data");
      const asset = await provider.upload(data, {
        filename: "test-image",
        contentType: "image/png",
      });

      expect(asset.id).toBe("test-image");
      expect(asset.filename).toBe("test-image");
      expect(asset.contentType).toBe("image/png");
      expect(asset.size).toBe(data.byteLength);
      expect(asset.createdAt).toBeInstanceOf(Date);
    });

    it("generates an ID when filename is not provided", async () => {
      const data = Buffer.from("no-name image");
      const asset = await provider.upload(data);

      expect(asset.id).toMatch(/^mock-asset-/);
    });

    it("includes metadata when provided", async () => {
      const data = Buffer.from("image with meta");
      const asset = await provider.upload(data, {
        filename: "meta-image",
        metadata: { alt: "A test image" },
      });

      expect(asset.metadata).toBeDefined();
      expect(asset.metadata!.alt).toBe("A test image");
    });
  });

  describe("getUrl", () => {
    it("returns a mock:// URL for an asset", () => {
      const { url } = provider.getUrl("my-asset");
      expect(url).toBe("mock://media/my-asset");
    });

    it("includes transform parameters in the URL", () => {
      const { url } = provider.getUrl("my-asset", {
        width: 200,
        height: 200,
        fit: "cover",
        format: "webp",
        quality: 80,
      });

      expect(url).toContain("mock://media/my-asset?");
      expect(url).toContain("w=200");
      expect(url).toContain("h=200");
      expect(url).toContain("fit=cover");
      expect(url).toContain("fm=webp");
      expect(url).toContain("q=80");
    });

    it("returns width and height from transforms", () => {
      const delivery = provider.getUrl("my-asset", { width: 300, height: 200 });
      expect(delivery.width).toBe(300);
      expect(delivery.height).toBe(200);
    });

    it("returns format from transforms", () => {
      const delivery = provider.getUrl("my-asset", { format: "avif" });
      expect(delivery.format).toBe("avif");
    });

    it("returns a clean URL when no transforms are provided", () => {
      const { url } = provider.getUrl("clean-asset");
      expect(url).toBe("mock://media/clean-asset");
      expect(url).not.toContain("?");
    });
  });

  describe("delete", () => {
    it("removes an uploaded asset", async () => {
      const data = Buffer.from("to delete");
      await provider.upload(data, { filename: "delete-me" });

      await provider.delete("delete-me");

      const { assets } = await provider.list();
      const ids = assets.map((a) => a.id);
      expect(ids).not.toContain("delete-me");
    });

    it("does not throw when deleting a nonexistent asset", async () => {
      await expect(provider.delete("nonexistent")).resolves.toBeUndefined();
    });
  });

  describe("list", () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await provider.upload(Buffer.from(`data-${i}`), { filename: `asset-${i}` });
      }
    });

    it("returns all uploaded assets", async () => {
      const { assets } = await provider.list();
      expect(assets).toHaveLength(5);
    });

    it("returns asset metadata without raw data", async () => {
      const { assets } = await provider.list();
      for (const asset of assets) {
        expect(asset.id).toBeDefined();
        expect(asset.size).toBeGreaterThan(0);
        expect((asset as Record<string, unknown>).data).toBeUndefined();
      }
    });

    describe("pagination", () => {
      it("respects maxResults", async () => {
        const { assets, nextCursor } = await provider.list({ maxResults: 2 });
        expect(assets).toHaveLength(2);
        expect(nextCursor).toBeDefined();
      });

      it("paginates with cursor", async () => {
        const first = await provider.list({ maxResults: 2 });
        expect(first.assets).toHaveLength(2);
        expect(first.nextCursor).toBeDefined();

        const second = await provider.list({ maxResults: 2, cursor: first.nextCursor });
        expect(second.assets).toHaveLength(2);

        // Pages should not overlap
        const firstIds = first.assets.map((a) => a.id);
        const secondIds = second.assets.map((a) => a.id);
        for (const id of secondIds) {
          expect(firstIds).not.toContain(id);
        }
      });

      it("returns no nextCursor on the last page", async () => {
        const { nextCursor } = await provider.list({ maxResults: 10 });
        expect(nextCursor).toBeUndefined();
      });
    });
  });
});
