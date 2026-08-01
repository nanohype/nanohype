#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { checkErrorPage } from "../check.js";
import { writeSitePages } from "../generate.js";

const USAGE = `nanohype-error-pages — emit or verify a site's 404/500 pages.

Usage:
  nanohype-error-pages --out <dir> --brand <name> [options]   generate pages
  nanohype-error-pages check <file...> [--status <code>]      verify a page

Generate:
  --out <dir>        directory to write into (created if missing)
  --brand <name>     site wordmark, shown on the pages
  --home <href>      primary-action link            (default: /)
  --stylesheet <p>   same-origin stylesheet path    (default: /error.css)
  --lang <code>      document language              (default: en)

Verify:
  --status <code>    status the page represents; when given, the page must
                     declare it (data-status or the numeral)

  -h, --help         show this help

There is no theme flag. The pages render from @nanohype/tokens, so a site's
error page cannot drift from the palette the rest of the site uses.
`;

interface Args {
  out?: string;
  brand?: string;
  home?: string;
  stylesheet?: string;
  lang?: string;
  help?: boolean;
}

export function parse(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = (): string => {
      const next = argv[++i];
      if (next === undefined) fail(`missing value for ${flag}`);
      return next;
    };
    switch (flag) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--out":
        args.out = value();
        break;
      case "--brand":
        args.brand = value();
        break;
      case "--home":
        args.home = value();
        break;
      case "--stylesheet":
        args.stylesheet = value();
        break;
      case "--lang":
        args.lang = value();
        break;
      default:
        fail(`unknown argument: ${flag}`);
    }
  }
  return args;
}

function fail(message: string): never {
  process.stderr.write(`error: ${message}\n\n${USAGE}`);
  process.exit(1);
}

/** `generate` (the default, verb-less path): write 404.html, 500.html, error.css. */
async function runGenerate(argv: string[]): Promise<void> {
  const args = parse(argv);

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (args.out === undefined) fail("--out is required");
  if (args.brand === undefined) fail("--brand is required");

  const written = await writeSitePages(args.out, {
    brand: args.brand,
    ...(args.home !== undefined ? { home: args.home } : {}),
    ...(args.stylesheet !== undefined ? { stylesheetHref: args.stylesheet } : {}),
    ...(args.lang !== undefined ? { lang: args.lang } : {}),
  });

  for (const path of written) process.stdout.write(`  wrote ${path}\n`);
}

/** `check <file...>`: verify each page honours the error-page contract. */
async function runCheck(argv: string[]): Promise<void> {
  const files: string[] = [];
  let status: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(USAGE);
      return;
    }
    if (arg === "--status") {
      const next = argv[++i];
      if (next === undefined) fail("missing value for --status");
      const parsed = Number(next);
      if (!Number.isInteger(parsed)) fail(`invalid status: ${next}`);
      status = parsed;
      continue;
    }
    if (arg === undefined) continue;
    if (arg.startsWith("-")) fail(`unknown argument: ${arg}`);
    files.push(arg);
  }

  if (files.length === 0) fail("check needs at least one file");

  let failed = false;
  for (const file of files) {
    const html = await readFile(file, "utf8");
    const report = checkErrorPage(html, status !== undefined ? { status } : {});
    if (report.ok) {
      process.stdout.write(`  ok   ${file}\n`);
    } else {
      failed = true;
      process.stdout.write(`  FAIL ${file}\n`);
      for (const violation of report.violations) process.stdout.write(`         - ${violation}\n`);
    }
  }

  if (failed) process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "check") {
    await runCheck(argv.slice(1));
    return;
  }
  await runGenerate(argv);
}

main().catch((error: unknown) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
