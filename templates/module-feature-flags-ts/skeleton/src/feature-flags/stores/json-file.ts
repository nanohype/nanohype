import { readFile, writeFile, access } from "node:fs/promises";
import type { Flag } from "../types.js";
import type { FlagStore } from "./types.js";
import { registerStore } from "./registry.js";

// ── JSON File Flag Store ────────────────────────────────────────────
//
// File-backed flag store that reads and writes flags as a JSON array
// on disk. Suitable for static or config-driven deployments where
// flags are managed via version control or a CI pipeline.
//
// Config:
//   filePath?: string  (default: FLAGS_FILE_PATH env or "./flags.json")
//

interface FileData {
  flags: Flag[];
}

function createJsonFileStore(): FlagStore {
  let filePath = "./flags.json";
  let data: FileData = { flags: [] };

  async function load(): Promise<void> {
    try {
      await access(filePath);
      const raw = await readFile(filePath, "utf-8");
      data = JSON.parse(raw) as FileData;
    } catch {
      // File doesn't exist yet — start with empty flags
      data = { flags: [] };
    }
  }

  async function save(): Promise<void> {
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  return {
    name: "json-file",

    async init(config: Record<string, unknown>): Promise<void> {
      filePath =
        (config.filePath as string) ??
        process.env.FLAGS_FILE_PATH ??
        "./flags.json";
      await load();
      console.log(`[flags] JSON file store loaded from ${filePath}`);
    },

    async getFlag(key: string): Promise<Flag | undefined> {
      return data.flags.find((f) => f.key === key);
    },

    async setFlag(flag: Flag): Promise<void> {
      const updated = { ...flag, updatedAt: new Date().toISOString() };
      const index = data.flags.findIndex((f) => f.key === flag.key);
      if (index >= 0) {
        data.flags[index] = updated;
      } else {
        data.flags.push(updated);
      }
      await save();
    },

    async listFlags(): Promise<Flag[]> {
      return [...data.flags];
    },

    async deleteFlag(key: string): Promise<void> {
      data.flags = data.flags.filter((f) => f.key !== key);
      await save();
    },

    async close(): Promise<void> {
      // No connections to release
    },
  };
}

// Self-register
registerStore("json-file", createJsonFileStore);
