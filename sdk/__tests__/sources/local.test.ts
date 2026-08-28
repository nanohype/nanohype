import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalSource } from "../../src/sources/local.js";

// Point at the real nanohype catalog (sibling to sdk/)
const CATALOG_ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("LocalSource", () => {
  const source = new LocalSource({ rootDir: CATALOG_ROOT });

  describe("listTemplates", () => {
    it("discovers templates from the real catalog", async () => {
      const entries = await source.listTemplates();
      expect(entries.length).toBeGreaterThan(0);
      const names = entries.map((e) => e.name);
      expect(names).toContain("go-cli");
      expect(names).toContain("agentic-loop");
    });

    it("returns well-formed catalog entries", async () => {
      const entries = await source.listTemplates();
      for (const entry of entries) {
        expect(entry.name).toBeTruthy();
        expect(entry.displayName).toBeTruthy();
        expect(entry.description).toBeTruthy();
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(entry.tags.length).toBeGreaterThan(0);
      }
    });

    it("returns empty array for nonexistent directory", async () => {
      const s = new LocalSource({ rootDir: "/tmp/nonexistent-nanohype" });
      const entries = await s.listTemplates();
      expect(entries).toEqual([]);
    });
  });

  describe("fetchTemplate", () => {
    it("fetches a real template with manifest and files", async () => {
      const { manifest, files } = await source.fetchTemplate("go-cli");
      expect(manifest.name).toBe("go-cli");
      expect(manifest.apiVersion).toBe("nanohype/v1");
      expect(files.length).toBeGreaterThan(0);
      // Skeleton paths should be relative (no templates/go-cli/skeleton/ prefix)
      for (const file of files) {
        expect(file.path).not.toContain("skeleton/");
        expect(file.content).toBeTruthy();
      }
    });

    it("throws on missing template", async () => {
      await expect(source.fetchTemplate("nonexistent-template")).rejects.toThrow(
        "Template 'nonexistent-template' not found",
      );
    });
  });

  describe("path containment", () => {
    it("rejects template names that traverse out of templates/", async () => {
      await expect(source.fetchTemplate("../sdk")).rejects.toThrow(/escapes/);
    });

    it("rejects template names that traverse to a sibling catalog directory", async () => {
      await expect(source.fetchTemplate("../composites")).rejects.toThrow(/escapes/);
    });

    it("rejects absolute template names", async () => {
      await expect(source.fetchTemplate("/etc/passwd")).rejects.toThrow(/escapes/);
    });

    it("rejects template names containing null bytes", async () => {
      await expect(source.fetchTemplate("go-cli\0evil")).rejects.toThrow(/null byte/);
    });

    it("rejects composite names that traverse out of composites/", async () => {
      await expect(source.fetchComposite("../../outside/secret")).rejects.toThrow(/escapes/);
    });

    it("rejects standard names that traverse out of standards/", async () => {
      await expect(
        source.fetchStandard("../package" as Parameters<typeof source.fetchStandard>[0]),
      ).rejects.toThrow(/escapes/);
    });

    it("rejects contract repo names that traverse out of the workspace parent", async () => {
      await expect(
        source.fetchContract("../../etc" as Parameters<typeof source.fetchContract>[0]),
      ).rejects.toThrow(/escapes/);
    });
  });

  describe("listComposites", () => {
    it("discovers composites from the real catalog", async () => {
      const entries = await source.listComposites();
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.name).toBeTruthy();
        expect(entry.templateCount).toBeGreaterThan(0);
      }
    });
  });

  describe("fetchComposite", () => {
    it("fetches a real composite manifest", async () => {
      const composites = await source.listComposites();
      expect(composites.length).toBeGreaterThan(0);

      const manifest = await source.fetchComposite(composites[0].name);
      expect(manifest.apiVersion).toBe("nanohype/v1");
      expect(manifest.kind).toBe("composite");
      expect(manifest.templates.length).toBeGreaterThan(0);
    });

    it("throws on missing composite", async () => {
      await expect(source.fetchComposite("nonexistent-composite")).rejects.toThrow(
        "Composite 'nonexistent-composite' not found",
      );
    });
  });
  // The rejection paths below need a catalog that is wrong on purpose, which the
  // real one cannot be — every gate in the repository exists to stop it. These
  // are the branches that decide whether a malformed manifest is refused or read
  // anyway, so leaving them to the real catalog means leaving them unproven.
  describe("manifests the catalog would never contain", () => {
    const roots: string[] = [];
    const fixture = async () => {
      const root = await mkdtemp(join(tmpdir(), "nanohype-local-"));
      roots.push(root);
      return root;
    };
    afterAll(async () => {
      await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })));
    });

    it("refuses a template manifest on an apiVersion it does not implement", async () => {
      const root = await fixture();
      await mkdir(join(root, "templates", "wrong-api"), { recursive: true });
      await writeFile(
        join(root, "templates", "wrong-api", "template.yaml"),
        "apiVersion: nanohype/v2\nkind: template\nname: wrong-api\n",
      );
      await expect(new LocalSource({ rootDir: root }).fetchTemplate("wrong-api")).rejects.toThrow(
        "Unsupported apiVersion: nanohype/v2",
      );
    });

    it("refuses a composite manifest on an apiVersion it does not implement", async () => {
      const root = await fixture();
      await mkdir(join(root, "composites"), { recursive: true });
      await writeFile(
        join(root, "composites", "wrong-api.yaml"),
        "apiVersion: nanohype/v2\nkind: composite\nname: wrong-api\n",
      );
      await expect(new LocalSource({ rootDir: root }).fetchComposite("wrong-api")).rejects.toThrow(
        "Unsupported apiVersion: nanohype/v2",
      );
    });

    it("refuses a composite manifest whose kind is not composite", async () => {
      // The discriminator every consumer filters on. Fetch rejects it rather
      // than skipping, which is the difference between a caller learning the
      // file is wrong and a caller silently receiving nothing.
      const root = await fixture();
      await mkdir(join(root, "composites"), { recursive: true });
      await writeFile(
        join(root, "composites", "wrong-kind.yaml"),
        "apiVersion: nanohype/v1\nkind: template\nname: wrong-kind\n",
      );
      await expect(new LocalSource({ rootDir: root }).fetchComposite("wrong-kind")).rejects.toThrow(
        "Expected kind 'composite', got 'template'",
      );
    });

    it("lists no composites when the directory is absent", async () => {
      const root = await fixture();
      await expect(new LocalSource({ rootDir: root }).listComposites()).resolves.toEqual([]);
    });

    it("skips directory entries that are not .yaml manifests", async () => {
      // The catalog itself can no longer hold one — validate:composite-files
      // rejects it — so a fixture is the only way to prove the skip still works
      // for a consumer pointing LocalSource at a tree that does.
      const root = await fixture();
      await mkdir(join(root, "composites"), { recursive: true });
      await writeFile(join(root, "composites", "notes.md"), "not a manifest\n");
      await writeFile(
        join(root, "composites", "real.yaml"),
        "apiVersion: nanohype/v1\nkind: composite\nname: real\ndisplayName: Real\n" +
          "description: Real\nversion: 0.1.0\ntags: [t]\nvariables: []\ntemplates: [{template: a, root: true}]\n",
      );
      const listed = await new LocalSource({ rootDir: root }).listComposites();
      expect(listed.map((e) => e.name)).toEqual(["real"]);
    });

    it("skips a listed manifest whose kind is not composite, and one that will not parse", async () => {
      const root = await fixture();
      await mkdir(join(root, "composites"), { recursive: true });
      await writeFile(
        join(root, "composites", "wrong-kind.yaml"),
        "apiVersion: nanohype/v1\nkind: template\nname: wrong-kind\n",
      );
      await writeFile(join(root, "composites", "broken.yaml"), "kind: [unclosed\n");
      await expect(new LocalSource({ rootDir: root }).listComposites()).resolves.toEqual([]);
    });

    it("leaves installed dependencies and build output out of a skeleton", async () => {
      const root = await fixture();
      const skeleton = join(root, "templates", "with-junk", "skeleton");
      await mkdir(join(skeleton, "node_modules"), { recursive: true });
      await mkdir(join(skeleton, "dist"), { recursive: true });
      await writeFile(join(skeleton, "node_modules", "installed.js"), "x\n");
      await writeFile(join(skeleton, "dist", "built.js"), "x\n");
      await writeFile(join(skeleton, "src.ts"), "export const a = 1;\n");
      await writeFile(
        join(root, "templates", "with-junk", "template.yaml"),
        "apiVersion: nanohype/v1\nkind: template\nname: with-junk\n",
      );
      const { files } = await new LocalSource({ rootDir: root }).fetchTemplate("with-junk");
      expect(files.map((f) => f.path)).toEqual(["src.ts"]);
    });

    it("fetches a template carrying no skeleton as a manifest with no files", async () => {
      const root = await fixture();
      await mkdir(join(root, "templates", "no-skeleton"), { recursive: true });
      await writeFile(
        join(root, "templates", "no-skeleton", "template.yaml"),
        "apiVersion: nanohype/v1\nkind: template\nname: no-skeleton\n",
      );
      const result = await new LocalSource({ rootDir: root }).fetchTemplate("no-skeleton");
      expect(result.manifest.name).toBe("no-skeleton");
      expect(result.files).toEqual([]);
    });
  });
});
