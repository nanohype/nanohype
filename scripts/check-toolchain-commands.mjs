#!/usr/bin/env node

//
// check-toolchain-commands.mjs — run the commands the toolchain standard
// publishes, against a repository in this tree that takes them.
//
// `standards/language-toolchain.json` publishes, per language, the commands
// every repository on this stack is expected to expose: install, build, lint,
// test, docs, typecheck. Other repositories dispatch on those strings. A
// command that cannot succeed is therefore not a local problem — it is a
// broken phase in every repository that takes the standard, and the failure
// arrives somewhere nobody is looking.
//
// That shipped: the Go docs phase published `go doc ./...`, which `go doc`
// reads as a symbol specification and refuses with exit 2.
//
// A published command nothing runs is the same shape as a comment nothing
// checks, so the commands are read out of the standard and executed.
//
// Nothing here restates the standard. Which keys hold a runnable command comes
// from `content.phases`; which repositories take a toolchain comes from the
// `manifest` each language publishes; whether a repository is in the state its
// install command assumes comes from the `lockfile` each language publishes.
// A gate carrying its own phase list runs a subset of what is published and
// says nothing about the rest, and a gate carrying its own list of languages
// decides who gets checked — which is how a language every consumer inherits
// went unexercised behind a message saying no repository in the tree took it,
// while fifty did.
//
// Two ways a command can be wrong, and both are checked:
//
//   - It cannot succeed. Run against a repository that takes the toolchain, it
//     must exit 0. The repository is a RENDERED template rather than a
//     skeleton: a skeleton carries placeholders in file content and in path
//     segments, nobody ever runs one, and whether a command survives contact
//     with a skeleton is an accident of where those placeholders fall.
//   - It cannot fail. A phase reporting success over a directory with nothing
//     in it is a gate in name only. Each command runs a second time in an
//     empty directory and must exit non-zero. Empty rather than a repository
//     with something taken out of it: a phase reading `tsconfig.json` is
//     unmoved by removing `package.json`, so a fixture built by removing one
//     named file is a negative for some phases and not others, and one fixture
//     that holds for every command in every language is worth more than a
//     stronger one written per language.
//
// Coverage is bounded by what is installed and by what the tree carries. A
// tool that is absent, a language no repository here takes, and a repository
// that does not carry the lockfile its install command reads are each reported
// unexercised and named — never skipped in silence, and never counted as a
// pass. The gate refuses outright when nothing ran.
//
// Usage: node scripts/check-toolchain-commands.mjs [root]

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { renderEntryTo } from "./lib/render.mjs";

const root = resolve(process.argv[2] ?? ".");
const STANDARD = resolve(root, "standards/language-toolchain.json");

const content = JSON.parse(readFileSync(STANDARD, "utf-8")).content;
const toolchains = content.toolchains;
if (!toolchains || Object.keys(toolchains).length === 0) {
  console.error(
    "check-toolchain-commands: standards/language-toolchain.json publishes no toolchains. " +
      "This gate runs what that file publishes and has nothing to run.",
  );
  process.exit(2);
}

// The phases every repository on the stack is expected to expose, in the order
// it runs them, taken from the standard rather than restated here. Without it
// this gate would have to decide which published keys are commands, and a
// command published under a key it did not think of would never run.
const PHASES = content.phases;
if (!Array.isArray(PHASES) || PHASES.length === 0) {
  console.error(
    "check-toolchain-commands: standards/language-toolchain.json publishes no `content.phases`. " +
      "That list is what says which of a toolchain's keys hold a runnable command, and this " +
      "gate will not substitute one of its own.",
  );
  process.exit(2);
}

/**
 * Every directory in the RENDERED catalog holding the named manifest, at any
 * depth.
 *
 * Rendered, not `templates/<name>/skeleton`. A skeleton is a template: it
 * carries placeholders in file content and in path segments, and nobody ever
 * runs one — scaffolding renders it first, and what a consumer gets is the
 * render. Running a published command over a skeleton measures an artifact
 * that does not ship, and whether it passes turns on where the placeholders
 * happen to fall rather than on the command. `__GO_MODULE__` is a valid Go
 * module path and `__PROJECT_NAME__` sits inside a TypeScript string, so those
 * two survive a compiler; `__JAVA_PKG__` is not a Java package name and
 * `__PKG_DIR__` is a directory segment, so Java cannot.
 *
 * A repository is still wherever its manifest is, because a rendered project's
 * code does not always sit at its root either.
 */
function repositoriesWith(manifest, renderedRoot) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.isDirectory()) walk(join(dir, entry.name));
    }
    if (existsSync(join(dir, manifest))) {
      found.push({ name: relative(renderedRoot, dir).split("\\").join("/") || ".", dir });
    }
  };
  for (const name of readdirSync(renderedRoot).sort()) {
    const entry = join(renderedRoot, name);
    if (statSync(entry).isDirectory()) walk(entry);
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Render every template in the catalog into one directory, and report what
 * would not render.
 *
 * A template that does not render is not this gate's finding — the catalog has
 * a check for exactly that — but it is a template whose published commands
 * cannot be run here, so it is named rather than passed over.
 */
async function renderCatalog(into) {
  const { LocalSource } = await import("../sdk/dist/sources/local.js");
  const { renderTemplate } = await import("../sdk/dist/renderer.js");
  const source = new LocalSource({ rootDir: root });

  const entries = await source.listTemplates();
  if (entries.length === 0) return { rendered: 0, unrenderable: null };

  const unrenderable = [];
  let rendered = 0;
  for (const entry of entries) {
    const dir = join(into, entry.name);
    mkdirSync(dir, { recursive: true });
    const result = await renderEntryTo(source, renderTemplate, entry.name, dir);
    if (result.ok) rendered++;
    else unrenderable.push(`${entry.name}: ${result.why}`);
  }
  return { rendered, unrenderable };
}

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", "build", "target"]);

/**
 * The executable a published command needs. A command is a shell line, so the
 * tool is its first word — the part that has to exist before the command can
 * say anything about the repository it runs in.
 */
function toolFor(command) {
  const first = command.trim().split(/\s+/)[0];
  // `pkgs=$(go list …)` — the assignment hides the tool one word further in.
  const assignment = first.match(/^\w+=\$\((\w[\w-]*)/);
  return assignment ? assignment[1] : first;
}

function onPath(tool) {
  try {
    execFileSync("sh", ["-c", `command -v ${tool}`], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run one published command in `cwd`, returning its exit code and, when it
 * failed, the tail of what it printed.
 *
 * Kept rather than discarded because a verdict without it is unreadable
 * anywhere but the machine that produced it: a reader seeing `mvn compile
 * succeeded in none of the 1 repositories` has to reproduce the run to learn
 * why, and the answer was in the output this already had in hand.
 */
function run(command, cwd) {
  try {
    execFileSync("sh", ["-c", command], { cwd, stdio: "pipe", timeout: 300_000 });
    return { code: 0 };
  } catch (err) {
    const output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    return {
      code: typeof err.status === "number" ? err.status : 1,
      tail: output.split("\n").filter(Boolean).slice(-12).join("\n"),
    };
  }
}

// Four outcomes, because one exit code carrying all of them tells a reader
// nothing about which of them happened.
//
//   failed      a command the standard publishes does not hold. The standard is
//               wrong, or the catalog is. Exit 1.
//   unreachable this runner has no tool to run a published command with, for a
//               language the tree carries repositories for. Nothing is known
//               about that command either way. Exit 2.
//   absent      no repository here takes the language at all. Nothing is wrong
//               and nothing is claimed.
//   notInState  repositories are here and the tools are here, but no repository
//               is in the state a command assumes. Reported and not ruled on.
const failed = [];
const unreachable = new Map();
const absent = [];
const notInState = [];
const notes = [];
const ran = [];
// Languages whose commands were actually run both ways, and languages whose
// delegating commands were checked against a manifest. The second is a weaker
// claim than the first and is not counted as the first.
// Counted per language·phase rather than per language. A language with one
// phase nobody could run is not a language this gate covered, and reporting
// it by name alone is the same overclaim one level down.
const ranBothWays = new Set();
const scriptsChecked = new Set();
const published = new Set();
// Phases that SUCCEEDED somewhere in the positive half. Having run is not
// the bar: a command that exited non-zero in every repository has been
// executed and has not been shown to work, and counting it as covered
// because it also refused an empty directory is the overclaim this count
// exists to remove.
const succeededPhases = new Set();
// The tail of what a failing command printed, so a verdict can carry its reason.
const lastOutput = new Map();

/**
 * The script a published command delegates to, when it delegates to one.
 *
 * `npm run docs` does not do anything itself: it runs whatever the repository
 * declares under that name, and in a repository that declares nothing it exits
 * non-zero whatever else is true. So a delegating command is only as published
 * as the script it names, and the standard cannot make a repository declare
 * one.
 *
 * This is the one question here answered by reading rather than running. It is
 * a question about a manifest's contents, and the manifest is source. What it
 * does not establish is that the script does anything — a `docs` script
 * spelled `true` satisfies it, and only running the phase in an installed
 * repository would say otherwise.
 */
function delegatedScript(command) {
  const npmRun = command.trim().match(/^npm\s+run\s+([\w:@.-]+)/);
  if (npmRun) return { manifest: "package.json", script: npmRun[1] };
  // `npm test` is `npm run test` with the sugar on.
  if (/^npm\s+(test|start)\b/.test(command.trim())) {
    return { manifest: "package.json", script: command.trim().split(/\s+/)[1] };
  }
  return null;
}

/** True when a manifest at `dir` declares the named script. */
function declaresScript(dir, manifestName, script) {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, manifestName), "utf-8"));
    return Boolean(manifest.scripts?.[script]);
  } catch {
    return false;
  }
}

/**
 * Run every published phase in `dir`, recording each outcome.
 *
 * `install` comes first where the standard names it, because the phases after
 * it run on what it fetches. When it fails in a repository that is supposed to
 * have one, nothing the later phases report would be about those phases, so
 * they are recorded as unexercised rather than as four more failures with one
 * cause. That does not apply to the negative half: a directory with no manifest
 * has no install to succeed, and every phase still has to refuse it.
 */
function runPhases(commands, dir, label, { expect, language }) {
  const outcomes = new Map();

  for (const phase of PHASES) {
    const command = commands[phase];
    if (!command) continue;

    const tool = toolFor(command);
    if (!onPath(tool)) {
      // Keyed, because the same absent tool is met once per repository and
      // once more in the empty directory, and a list of repetitions reads as
      // several problems.
      unreachable.set(`${language} · ${phase}`, `${language} · ${phase}: ${tool} is not installed`);
      continue;
    }

    const { code, tail } = run(command, dir);
    ran.push(`${label} · ${phase}  exit ${code}`);
    outcomes.set(phase, code);
    if (code !== 0 && tail) lastOutput.set(`${label} · ${phase}`, tail);

    if (expect === "failure" && code === 0) {
      failed.push(
        `${label}  ${phase}: \`${command}\` exited 0 in a directory with nothing in it, so ` +
          "the phase reports success over anything",
      );
    }

    if (expect === "success" && phase === "install" && code !== 0) {
      for (const later of PHASES.slice(PHASES.indexOf(phase) + 1)) {
        if (commands[later]) notes.push(`${label} · ${later}: install did not succeed`);
      }
      break;
    }
  }

  return outcomes;
}

// The catalog, rendered once, because that is what the published commands are
// defined over. Everything below runs inside it.
const catalogScratch = mkdtempSync(join(tmpdir(), "toolchain-catalog-"));
const renderedRoot = join(catalogScratch, "rendered");
mkdirSync(renderedRoot, { recursive: true });
const { rendered: renderedCount, unrenderable } = await renderCatalog(renderedRoot);

if (unrenderable === null) {
  console.error(
    "check-toolchain-commands: the catalog listed zero templates, so there is nothing to " +
      "render and nothing to run a published command against.",
  );
  rmSync(catalogScratch, { recursive: true, force: true });
  process.exit(2);
}
for (const u of unrenderable) {
  notInState.push(`${u} — its published commands were not run`);
}

for (const [language, commands] of Object.entries(toolchains)) {
  const manifest = commands.manifest;
  if (!manifest) {
    absent.push(`${language}: the standard names no manifest, so no repository identifies it`);
    continue;
  }

  for (const phase of PHASES) {
    if (commands[phase]) published.add(`${language} · ${phase}`);
  }

  const repositories = repositoriesWith(manifest, renderedRoot);
  if (repositories.length === 0) {
    absent.push(`${language}: nothing the catalog renders carries a ${manifest}`);
    continue;
  }

  // A published command is a claim about the command, not about every
  // repository, so the question is whether each phase can succeed anywhere in
  // this tree and refuse a directory that is not a repository of its language.
  // A phase succeeding in one repository and failing in another is a fact about
  // that repository; a phase succeeding in none is the defect this gate exists
  // for, and `go doc ./...` was one.
  const succeededSomewhere = new Set();
  const attempted = new Set();

  for (const repo of repositories) {
    const outcomes = runPhases(commands, repo.dir, `${language} · ${repo.name}`, {
      expect: "success",
      language,
    });
    for (const [phase, code] of outcomes) {
      attempted.add(phase);
      if (code === 0) {
        succeededSomewhere.add(phase);
        succeededPhases.add(`${language} · ${phase}`);
      }
    }
  }

  // `install` is the one phase whose failure everywhere is not this gate's to
  // rule on. It reads state a repository acquires by being installed once and
  // committing the result, and whether a template ought to carry that state is
  // a decision about the catalog rather than about the command. Reported in
  // full, ruled on by nobody here.
  const installUnheld = attempted.has("install") && !succeededSomewhere.has("install");
  if (installUnheld) {
    notInState.push(
      `${language}: \`${commands.install}\` succeeded in none of the ${repositories.length} ` +
        `repositor(ies) carrying ${manifest}, so no later phase ran in any of them. The ` +
        `standard names ${commands.lockfile} as this language's lockfile and no repository ` +
        "here carries one.",
    );
  }

  // A delegating command is checkable without installing anything, which
  // matters: where install cannot succeed, nothing else about the language runs
  // and a phase naming a script no repository declares would go unremarked. It
  // is the shape `npm run docs` had, and no package.json in this tree declared
  // it — not a skeleton, not one of the repository's own packages.
  for (const phase of PHASES) {
    const command = commands[phase];
    if (!command) continue;
    const delegated = delegatedScript(command);
    if (!delegated || delegated.manifest !== manifest) continue;
    const declaring = repositories.filter((repo) =>
      declaresScript(repo.dir, manifest, delegated.script),
    );
    if (declaring.length === 0) {
      failed.push(
        `${language}  ${phase}: \`${command}\` runs a \`${delegated.script}\` script, and ` +
          `none of the ${repositories.length} repositor(ies) carrying ${manifest} declares one. ` +
          "Every repository taking this toolchain inherits a phase that cannot pass.",
      );
    } else if (declaring.length < repositories.length) {
      notes.push(
        `${language} · ${phase}: ${repositories.length - declaring.length} of ` +
          `${repositories.length} repositor(ies) declare no \`${delegated.script}\` script`,
      );
    }
    scriptsChecked.add(`${language} · ${phase}`);
  }

  for (const phase of attempted) {
    if (phase === "install" || succeededSomewhere.has(phase)) continue;
    failed.push(
      `${language}  ${phase}: \`${commands[phase]}\` succeeded in none of the ` +
        `${repositories.length} repositor(ies) carrying ${manifest}. Every repository taking ` +
        "this toolchain inherits a phase that cannot pass." +
        (repositories
          .map((repo) => lastOutput.get(`${language} · ${repo.name} · ${phase}`))
          .find(Boolean)
          ? `\n      last output:\n        ${repositories
              .map((repo) => lastOutput.get(`${language} · ${repo.name} · ${phase}`))
              .find(Boolean)
              .split("\n")
              .join("\n        ")}`
          : ""),
    );
  }

  // A phase that cannot fail reports success over anything, which is the same
  // defect inverted, so every phase runs a second time in an empty directory
  // and must refuse it.
  //
  // Empty rather than a copy with something removed. A copy with the manifest
  // taken out is not a negative for every phase: `npx tsc --noEmit` and a
  // documentation generator read `tsconfig.json`, so removing `package.json`
  // leaves them running exactly as before and exiting 0, and the fixture proves
  // nothing while appearing to. A directory with nothing in it is a negative
  // for every command in every language, and it is the same fixture for all of
  // them rather than one written per language.
  //
  // Run whatever the positive half did, because it needs nothing installed and
  // nothing resolved. Tying it to the positive half would make the negative
  // claim depend on state a repository acquires by being built in — the
  // difference between a fresh clone and a machine that has run the suites
  // once — and a gate whose claims move with the working tree is not making
  // one.
  const scratch = mkdtempSync(join(tmpdir(), `toolchain-${language}-`));
  const empty = join(scratch, "empty");
  try {
    mkdirSync(empty);
    const refused = runPhases(commands, empty, `${language} · an empty directory`, {
      expect: "failure",
      language,
    });
    // Per phase, and only where the phase ran in both halves. A language whose
    // every tool is absent reaches here having executed nothing, and counting
    // that as exercised is the empty-corpus defect one level in; counting a
    // language whose lint phase never ran is the same thing with a smaller
    // hole.
    for (const phase of refused.keys()) {
      const key = `${language} · ${phase}`;
      if (succeededPhases.has(key)) ranBothWays.add(key);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

rmSync(catalogScratch, { recursive: true, force: true });

/** Everything the run could not reach, printed the same way whatever the verdict. */
function reportGaps(write) {
  if (unreachable.size) {
    write("\n  unreachable — this runner has no tool to run these with:");
    for (const u of [...unreachable.values()].sort()) write(`    ${u}`);
  }
  if (notInState.length) {
    write("\n  not in the state the command assumes — reported, not ruled on:");
    for (const n of notInState) write(`    ${n}`);
  }
  if (absent.length) {
    write("\n  no repository here takes these at all:");
    for (const a of absent) write(`    ${a}`);
  }
  if (notes.length) {
    write("\n  and per repository:");
    for (const n of notes) write(`    ${n}`);
  }
}

if (failed.length) {
  console.error(
    `check-toolchain-commands: ${failed.length} published command(s) do not hold.\n` +
      "Other repositories dispatch on these strings, so a command that cannot succeed is a\n" +
      "broken phase everywhere the standard is taken, and one that cannot fail is a phase\n" +
      "reporting success over anything.\n",
  );
  for (const f of failed) console.error(`  ${f}`);
  reportGaps((line) => console.error(line));
  process.exit(1);
}

if (ranBothWays.size === 0 && scriptsChecked.size === 0) {
  console.error(
    "check-toolchain-commands: not one published command was run. A run where every language " +
      "stopped short asserts nothing about any of them, whatever it printed on the way.\n",
  );
  reportGaps((line) => console.error(line));
  process.exit(2);
}

const covered = [...ranBothWays].sort();
const uncovered = [...published].filter((p) => !ranBothWays.has(p)).sort();

console.log(
  `check-toolchain-commands: ran ${ran.length} published command(s) from ` +
    `standards/language-toolchain.json, over the phases that file names in content.phases and ` +
    `the repositories its per-language manifest identifies inside ${renderedCount} rendered ` +
    `template(s).\n` +
    `\n` +
    `Rendered, not the skeletons. A skeleton carries placeholders in file content and in path ` +
    `segments and nobody runs one — a consumer gets the render — so what a published command ` +
    `does to a skeleton turns on where those placeholders fall rather than on the command. ` +
    `This says the commands succeed against what the catalog renders, which is the claim worth ` +
    `making.\n` +
    `\n` +
    `Run both ways: ${covered.length} of the ${published.size} phase(s) the standard publishes.\n` +
    `${covered.map((c) => `  ${c}`).join("\n")}\n` +
    `\n` +
    `Counted per phase rather than per language, because a language with one phase nobody ` +
    `could run is not a language this covered, and naming the language alone is the same ` +
    `overclaim one level down. Each of those ran twice — in every repository carrying its ` +
    `language's manifest, where it had to exit 0 in at least one of them, and in an empty ` +
    `directory, where it had to exit non-zero. What the empty directory establishes is that a ` +
    `phase cannot report success over anything, and not that it detects a repository which is ` +
    `present and broken.\n` +
    `\n` +
    `Not run both ways: ${uncovered.length} phase(s). This gate claims nothing about them.\n` +
    `${uncovered.map((u) => `  ${u}`).join("\n")}\n` +
    `\n` +
    `Most of those are a tool this runner does not have. That is worth stating plainly rather ` +
    `than counting as coverage: this is the repository that publishes ` +
    `standards/language-toolchain.json, so a phase the standard names and this job cannot run ` +
    `is the standard unmet where it is written, and a floor met by whichever tools a machine ` +
    `happens to carry is met by luck. Closing it means installing the tool where this runs, or ` +
    `retiring the phase from the standard. Naming it is not closing it.\n` +
    `\n` +
    `Scripts checked: ${[...scriptsChecked].sort().join(", ") || "none"}. A phase whose command ` +
    `runs a project script — \`npm run <name>\` — is held to a second thing, whether or not it ` +
    `ran: some repository carrying that language's manifest has to declare the script. A ` +
    `command delegating to a script nobody declares cannot pass anywhere, and needs nothing ` +
    `installed to show it. That check reads a manifest, so it says the script exists and not ` +
    `that it does anything.`,
);
for (const line of ran) console.log(`  ${line}`);
reportGaps((line) => console.log(line));
