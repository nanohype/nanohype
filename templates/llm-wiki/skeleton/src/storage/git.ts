import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { readdir } from "fs/promises";
import { join, relative, resolve } from "path";
import { simpleGit } from "simple-git";
import type { StorageProvider, PageCommit } from "./types.js";
import { registerStorageProvider } from "./registry.js";
import { getConfig } from "../config.js";

const TENANT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function validateTenantId(tenantId: string): void {
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new Error(`Invalid tenant ID: "${tenantId}" — must be kebab-case`);
  }
}

function wikiDir(tenantId: string): string {
  validateTenantId(tenantId);
  return join(getConfig().WIKI_DATA_DIR, tenantId, "wiki");
}

function safePath(base: string, userPath: string): string {
  const resolved = resolve(base, userPath);
  if (!resolved.startsWith(base + "/") && resolved !== base) {
    throw new Error(`Path traversal denied: "${userPath}"`);
  }
  return resolved;
}

async function ensureGitRepo(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const git = simpleGit(dir);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    await git.init();
  }
}

async function collectMdFiles(dir: string, prefix?: string): Promise<string[]> {
  const base = prefix ? join(dir, prefix) : dir;
  if (!existsSync(base)) return [];

  const results: string[] = [];
  const entries = await readdir(base, { withFileTypes: true, recursive: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const entryPath = join(entry.parentPath ?? entry.path, entry.name);
      results.push(relative(dir, entryPath));
    }
  }

  return results;
}

class GitStorageProvider implements StorageProvider {
  readonly name = "git";

  async readPage(tenantId: string, path: string): Promise<string | null> {
    const dir = wikiDir(tenantId);
    const filePath = safePath(dir, path);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  }

  async writePage(
    tenantId: string,
    path: string,
    content: string,
    message: string,
  ): Promise<void> {
    const dir = wikiDir(tenantId);
    await ensureGitRepo(dir);

    const filePath = safePath(dir, path);
    const fileDir = join(filePath, "..");
    if (!existsSync(fileDir)) {
      mkdirSync(fileDir, { recursive: true });
    }

    writeFileSync(filePath, content, "utf-8");

    const git = simpleGit(dir);
    await git.add(path);
    await git.commit(message);
  }

  async deletePage(
    tenantId: string,
    path: string,
    message: string,
  ): Promise<void> {
    const dir = wikiDir(tenantId);
    const filePath = safePath(dir, path);
    if (!existsSync(filePath)) {
      throw new Error(`Page not found: ${path}`);
    }

    unlinkSync(filePath);

    const git = simpleGit(dir);
    await git.add(path);
    await git.commit(message);
  }

  async listPages(tenantId: string, prefix?: string): Promise<string[]> {
    const dir = wikiDir(tenantId);
    return collectMdFiles(dir, prefix);
  }

  async search(tenantId: string, query: string): Promise<string[]> {
    const dir = wikiDir(tenantId);
    await ensureGitRepo(dir);

    const git = simpleGit(dir);
    try {
      const result = await git.grep(query);
      const paths = new Set<string>();
      for (const file of Object.keys(result.results)) {
        paths.add(file);
      }
      return [...paths];
    } catch {
      // git grep fails with exit code 1 when no matches found
      return [];
    }
  }

  async getHistory(
    tenantId: string,
    path: string,
    limit?: number,
  ): Promise<PageCommit[]> {
    const dir = wikiDir(tenantId);
    await ensureGitRepo(dir);

    const git = simpleGit(dir);
    const options: Record<string, string | number | undefined> = { file: path };
    if (limit) {
      options["maxCount"] = limit;
    }

    try {
      const log = await git.log(options);
      return log.all.map((entry) => ({
        sha: entry.hash,
        message: entry.message,
        timestamp: new Date(entry.date),
      }));
    } catch {
      return [];
    }
  }
}

registerStorageProvider("git", () => new GitStorageProvider());
