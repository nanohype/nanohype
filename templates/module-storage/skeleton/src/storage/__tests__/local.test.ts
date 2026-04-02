import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Import the local provider module to trigger self-registration
import "../providers/local.js";
import { getProvider } from "../providers/registry.js";
import type { StorageProvider } from "../providers/types.js";

describe("local filesystem storage provider", () => {
  let provider: StorageProvider;
  let tmpDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));

    provider = getProvider("local");
    await provider.init({ basePath: tmpDir });
  });

  afterEach(async () => {
    // Clean up the temp directory
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("is registered under the name 'local'", () => {
    expect(provider.name).toBe("local");
  });

  it("uploads and downloads a string", async () => {
    await provider.upload("hello.txt", "Hello, world!");

    const data = await provider.download("hello.txt");

    expect(data.toString("utf-8")).toBe("Hello, world!");
  });

  it("uploads and downloads a Buffer", async () => {
    const content = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    await provider.upload("binary.bin", content);

    const data = await provider.download("binary.bin");

    expect(Buffer.compare(data, content)).toBe(0);
  });

  it("creates intermediate directories for nested keys", async () => {
    await provider.upload("a/b/c/deep.txt", "nested");

    const data = await provider.download("a/b/c/deep.txt");
    expect(data.toString("utf-8")).toBe("nested");
  });

  it("deletes an uploaded object", async () => {
    await provider.upload("to-delete.txt", "gone soon");
    await provider.delete("to-delete.txt");

    await expect(provider.download("to-delete.txt")).rejects.toThrow();
  });

  it("delete is a no-op for non-existent keys", async () => {
    // Should not throw
    await provider.delete("does-not-exist.txt");
  });

  it("lists objects in the storage root", async () => {
    await provider.upload("file-a.txt", "a");
    await provider.upload("file-b.txt", "b");

    const result = await provider.list();

    const keys = result.objects.map((o) => o.key);
    expect(keys).toContain("file-a.txt");
    expect(keys).toContain("file-b.txt");
    expect(result.objects.length).toBe(2);
  });

  it("lists objects filtered by prefix", async () => {
    await provider.upload("images/photo.jpg", "img-data");
    await provider.upload("docs/readme.md", "doc-data");

    const result = await provider.list("images");

    const keys = result.objects.map((o) => o.key);
    expect(keys).toContain("images/photo.jpg");
    expect(keys).not.toContain("docs/readme.md");
  });

  it("returns empty list for non-existent prefix", async () => {
    const result = await provider.list("nonexistent");

    expect(result.objects).toEqual([]);
  });

  it("includes size metadata in listed objects", async () => {
    const content = "known length";
    await provider.upload("sized.txt", content);

    const result = await provider.list();
    const obj = result.objects.find((o) => o.key === "sized.txt");

    expect(obj).toBeDefined();
    expect(obj!.size).toBe(Buffer.byteLength(content, "utf-8"));
  });

  it("generates a file:// signed URL", async () => {
    await provider.upload("signed.txt", "data");

    const url = await provider.getSignedUrl("signed.txt");

    expect(url).toMatch(/^file:\/\//);
    expect(url).toContain("signed.txt");
  });
});
