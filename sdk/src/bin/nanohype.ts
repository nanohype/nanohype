#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import * as yaml from "js-yaml";
import { renderComposite } from "../composite.js";
import { resolveWithin } from "../paths.js";
import { renderTemplate } from "../renderer.js";
import type { CatalogSource } from "../source.js";
import { GitHubSource } from "../sources/github.js";
import { LocalSource } from "../sources/local.js";
import type { CompositeManifest, TemplateManifest } from "../types.js";
import { validateCompositeManifest, validateManifest } from "../validator.js";

// ── Arg parsing ──────────────────────────────────────────────────────

interface ParsedArgs {
  command: string;
  positional: string;
  vars: Record<string, string>;
  output?: string;
  local?: string;
  token?: string;
  composite: boolean;
  composites: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const result: ParsedArgs = {
    command: "",
    positional: "",
    vars: {},
    composite: false,
    composites: false,
    help: false,
  };

  let i = 0;
  // First non-flag arg is the command
  while (i < args.length && args[i].startsWith("-")) {
    if (args[i] === "--help" || args[i] === "-h") {
      result.help = true;
      i++;
      continue;
    }
    if (args[i] === "--composite") {
      result.composite = true;
      i++;
      continue;
    }
    if (args[i] === "--composites") {
      result.composites = true;
      i++;
      continue;
    }
    if (args[i] === "--var") {
      if (i + 1 >= args.length) {
        console.error("Error: --var requires a Key=value argument");
        process.exit(1);
      }
      parseVar(result.vars, args[++i]);
      i++;
      continue;
    }
    if ((args[i] === "--output" || args[i] === "-o") && i + 1 < args.length) {
      result.output = args[++i];
      i++;
      continue;
    }
    if (args[i] === "--local" && i + 1 < args.length) {
      result.local = args[++i];
      i++;
      continue;
    }
    if (args[i] === "--token" && i + 1 < args.length) {
      result.token = args[++i];
      i++;
      continue;
    }
    i++;
  }

  if (i < args.length) result.command = args[i++];
  // Remaining args: positional and flags interleaved
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      i++;
      continue;
    }
    if (arg === "--composite") {
      result.composite = true;
      i++;
      continue;
    }
    if (arg === "--composites") {
      result.composites = true;
      i++;
      continue;
    }
    if (arg === "--var") {
      if (i + 1 >= args.length) {
        console.error("Error: --var requires a Key=value argument");
        process.exit(1);
      }
      parseVar(result.vars, args[++i]);
      i++;
      continue;
    }
    if ((arg === "--output" || arg === "-o") && i + 1 < args.length) {
      result.output = args[++i];
      i++;
      continue;
    }
    if (arg === "--local" && i + 1 < args.length) {
      result.local = args[++i];
      i++;
      continue;
    }
    if (arg === "--token" && i + 1 < args.length) {
      result.token = args[++i];
      i++;
      continue;
    }
    if (!result.positional) result.positional = arg;
    i++;
  }

  return result;
}

function parseVar(vars: Record<string, string>, raw: string): void {
  const eq = raw.indexOf("=");
  if (eq === -1) {
    console.error(`Invalid --var format: ${raw} (expected Key=value)`);
    process.exit(1);
  }
  vars[raw.slice(0, eq)] = raw.slice(eq + 1);
}

// ── Source resolution ────────────────────────────────────────────────

function resolveSource(args: ParsedArgs): CatalogSource {
  if (args.local) {
    return new LocalSource({ rootDir: resolve(args.local) });
  }
  const token = args.token || process.env.GITHUB_TOKEN;
  return new GitHubSource({ token });
}

// ── Interactive prompt ───────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((res) => {
    rl.question(question, (answer) => {
      rl.close();
      res(answer.trim());
    });
  });
}

// ── Commands ─────────────────────────────────────────────────────────

async function scaffold(args: ParsedArgs): Promise<void> {
  const name = args.positional;
  if (!name) {
    console.error("Usage: nanohype scaffold <name> [--composite] [--var K=V] [-o dir]");
    process.exit(1);
  }

  const source = resolveSource(args);
  const isInteractive = process.stdin.isTTY ?? false;

  if (args.composite) {
    // Composite scaffold
    const manifest = await source.fetchComposite(name);
    const values: Record<string, string | boolean | number> = { ...args.vars };

    // Prompt for missing required variables
    for (const v of manifest.variables) {
      if (v.name in values) continue;
      if (v.default !== undefined) continue;
      if (!v.required) continue;
      if (isInteractive) {
        const answer = await prompt(`${v.prompt || v.name} (${v.description}): `);
        values[v.name] =
          v.type === "bool" ? answer === "true" : v.type === "int" ? parseInt(answer, 10) : answer;
      } else {
        console.error(`Missing required variable: ${v.name}`);
        process.exit(1);
      }
    }

    const result = await renderComposite(manifest, values, source);
    const outDir = resolve(args.output || `./${name}`);

    for (const file of result.files) {
      // The renderer already refuses a path that leaves the render root. This
      // is the same question asked against the directory the user actually
      // named, which is the only place it can be answered for certain — and it
      // is the last step before a name reaches the disk.
      const dest = resolveWithin(outDir, file.path);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, file.content, "utf-8");
    }

    console.log(`${result.files.length} files written to ${outDir}`);
    if (result.entries.length > 0) {
      console.log(
        `Composed ${result.entries.length} templates: ${result.entries.map((e) => e.template).join(", ")}`,
      );
    }
    for (const w of result.warnings) console.log(`  warn: ${w}`);
    for (const h of result.hooks.post) console.log(`  Run post-scaffold hook: ${h.run}`);
  } else {
    // Single template scaffold
    const { manifest, files } = await source.fetchTemplate(name);
    const values: Record<string, string | boolean | number> = { ...args.vars };

    // Prompt for missing required variables
    for (const v of manifest.variables) {
      if (v.name in values) continue;
      if (v.default !== undefined) continue;
      if (!v.required) continue;
      if (isInteractive) {
        const answer = await prompt(`${v.prompt || v.name} (${v.description}): `);
        values[v.name] =
          v.type === "bool" ? answer === "true" : v.type === "int" ? parseInt(answer, 10) : answer;
      } else {
        console.error(`Missing required variable: ${v.name}`);
        process.exit(1);
      }
    }

    const result = renderTemplate(manifest, files, values);
    const defaultDir = String(values["ProjectName"] || name);
    const outDir = resolve(args.output || `./${defaultDir}`);

    for (const file of result.files) {
      // The renderer already refuses a path that leaves the render root. This
      // is the same question asked against the directory the user actually
      // named, which is the only place it can be answered for certain — and it
      // is the last step before a name reaches the disk.
      const dest = resolveWithin(outDir, file.path);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, file.content, "utf-8");
    }

    console.log(`${result.files.length} files written to ${outDir}`);
    for (const w of result.warnings) console.log(`  warn: ${w}`);
    for (const h of result.hooks.post) console.log(`  Run post-scaffold hook: ${h.run}`);
  }
}

async function list(args: ParsedArgs): Promise<void> {
  const source = resolveSource(args);

  if (args.composites) {
    const entries = await source.listComposites();
    if (entries.length === 0) {
      console.log("No composites found.");
      return;
    }
    const nameW = Math.max(4, ...entries.map((e) => e.name.length));
    const dispW = Math.max(7, ...entries.map((e) => e.displayName.length));
    console.log(`${"NAME".padEnd(nameW)}  ${"DISPLAY".padEnd(dispW)}  TEMPLATES  TAGS`);
    for (const e of entries) {
      console.log(
        `${e.name.padEnd(nameW)}  ${e.displayName.padEnd(dispW)}  ${String(e.templateCount).padStart(9)}  ${e.tags.join(", ")}`,
      );
    }
  } else {
    const entries = await source.listTemplates();
    if (entries.length === 0) {
      console.log("No templates found.");
      return;
    }
    const nameW = Math.max(4, ...entries.map((e) => e.name.length));
    const dispW = Math.max(7, ...entries.map((e) => e.displayName.length));
    console.log(`${"NAME".padEnd(nameW)}  ${"DISPLAY".padEnd(dispW)}  TAGS`);
    for (const e of entries) {
      console.log(`${e.name.padEnd(nameW)}  ${e.displayName.padEnd(dispW)}  ${e.tags.join(", ")}`);
    }
  }
}

async function validate(args: ParsedArgs): Promise<void> {
  const filePath = args.positional;
  if (!filePath) {
    console.error("Usage: nanohype validate <path-to-template.yaml>");
    process.exit(1);
  }

  const absPath = resolve(filePath);
  let text: string;
  try {
    text = await readFile(absPath, "utf-8");
  } catch {
    console.error(`Cannot read file: ${absPath}`);
    process.exit(1);
  }

  const doc = yaml.load(text) as Record<string, unknown>;

  try {
    if (doc.kind === "composite") {
      validateCompositeManifest(doc as unknown as CompositeManifest);
      console.log(`PASS  ${absPath} (composite)`);
    } else {
      validateManifest(doc as unknown as TemplateManifest);
      console.log(`PASS  ${absPath}`);
    }
  } catch (err) {
    console.error(`FAIL  ${absPath}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`nanohype — scaffold projects from nanohype templates

USAGE
  nanohype scaffold <name>                  Scaffold a template
  nanohype scaffold --composite <name>      Scaffold a composite
  nanohype list                             List available templates
  nanohype list --composites                List available composites
  nanohype validate <path>                  Validate a template.yaml

FLAGS
  --var Key=value       Set a template variable (repeatable)
  --output, -o <dir>    Output directory (default: ./<ProjectName> or ./<name>)
  --local <path>        Use local filesystem source instead of GitHub
  --token <token>       GitHub token (or set GITHUB_TOKEN env var)
  --help, -h            Show this help message

EXAMPLES
  nanohype list --local /path/to/nanohype
  nanohype scaffold agentic-loop --local .. --var ProjectName=my-agent -o ./out
  nanohype scaffold --composite ai-web-app --local .. --var ProjectName=myapp
  nanohype validate templates/go-cli/template.yaml`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help || (!args.command && !args.help)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  try {
    switch (args.command) {
      case "scaffold":
        await scaffold(args);
        break;
      case "list":
        await list(args);
        break;
      case "validate":
        await validate(args);
        break;
      default:
        console.error(`Unknown command: ${args.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

// The inner try/catch covers the subcommands; this covers everything outside
// it — argument parsing, and a throw from the handler itself. Without it the
// exit code on that path is Node's default for an unhandled rejection, which
// is a flag away from being 0.
main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
