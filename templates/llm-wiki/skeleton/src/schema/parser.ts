import { readFileSync } from "fs";
import { z } from "zod";
import { parse } from "yaml";
import type { WikiSchema } from "./types.js";

const pageTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  requiredSections: z.array(z.string()),
});

const wikiSchemaZod = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  pageTypes: z.array(pageTypeSchema).min(1),
  structure: z.object({
    index: z.string().min(1),
    orphanThresholdDays: z.number().int().positive(),
    contradictionPolicy: z.enum(["flag", "warn", "reject"]),
  }),
  llm: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    maxPagesPerIngest: z.number().int().positive(),
  }),
});

export function parseSchema(content: string): WikiSchema {
  const raw = parse(content);
  return wikiSchemaZod.parse(raw);
}

export function loadSchema(filePath: string): WikiSchema {
  const content = readFileSync(filePath, "utf-8");
  return parseSchema(content);
}
