#!/usr/bin/env node
/**
 * Sync the vendored copies this repo carries from nanohype — the single source
 * of truth for runtime modules, org tooling config, the tenant-chart-base
 * library chart, and this script itself.
 *
 *   node scripts/sync-vendored.mjs                # re-vendor at the pinned ref
 *   node scripts/sync-vendored.mjs --ref=<sha>    # re-vendor and move the pin
 *   node scripts/sync-vendored.mjs --check        # the blocking CI gate
 *   node scripts/sync-vendored.mjs --freshness    # is the pin behind upstream?
 *   node scripts/sync-vendored.mjs --self-test    # prove the gate still rejects
 *
 * Driven by the manifest next to this file (`scripts/vendored.json`). Its
 * `upstream` block names the source repository and a full 40-character commit
 * SHA; each `entries` item declares a source path relative to that repository
 * and a destination path relative to this repo's root, with `"dir": true` for a
 * whole tree. Directories listed in `exclusiveDirs` may contain only
 * manifest-listed files, so unconsumed modules cannot accumulate unnoticed.
 *
 * The script is itself a manifest entry (`library/scripts/sync-vendored.mjs`
 * upstream), so fixes to the sync machinery propagate outward like every other
 * vendored surface.
 *
 * ── Why the pin ──
 *
 * Every mode reads upstream AT THE PINNED REF, through git objects rather than
 * whatever the checkout's working tree happens to hold. That is the whole point
 * of `upstream.ref`: a required check must be a verdict about the commit under
 * test, and it cannot be while one side of the comparison keeps moving. Reading
 * a branch instead would mean an unrelated merge in nanohype turns this
 * repository's `main` red without a commit landing here — and it would mean two
 * runs of the same commit could disagree.
 *
 * Sync reads at the pin for the same reason. If `--check` compared against the
 * pin while a plain sync copied from the working tree, the two would contradict
 * each other the moment the checkout sat on any other commit. Vendoring is
 * therefore always from committed upstream history: land the change there with
 * its tests, then move the pin here with `--ref=<sha>` and review the diff.
 *
 * Whether the pin has fallen behind is a different question with a different
 * answer every day, and answering it on the blocking path would reintroduce
 * exactly the coupling the pin removes. `--freshness` asks it separately and
 * runs on a schedule, where a red run is a notification rather than a merge
 * blocker.
 *
 * ── Failure posture ──
 *
 * Nothing degrades into a skip. A missing checkout, a checkout without the
 * pinned commit, a manifest naming a branch instead of a SHA, a declared source
 * path that does not exist at the pin, a file entry that is a directory
 * upstream — all of these stop the run rather than quietly comparing nothing.
 * `--self-test` breaks the inputs those rules exist to catch and fails unless
 * every break is rejected, so the gate's own guards stay honest.
 *
 * The upstream checkout resolves from `$NANOHYPE_DIR`, defaulting to a sibling
 * checkout at `../nanohype`. CI checks the source of truth out at the pinned
 * ref and points the variable at it; a local checkout on any commit answers
 * correctly as long as the pinned commit is reachable, so `fetch-depth: 0` is
 * required wherever history beyond a single commit is needed and a shallow
 * clone fails loudly rather than silently.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const UPSTREAM_DIR = process.env.NANOHYPE_DIR ?? join(ROOT, "..", "nanohype");

const exec = promisify(execFile);
const out = (line) => process.stdout.write(`${line}\n`);
const isSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const MAX_BUFFER = 64 * 1024 * 1024;

/** A rule the gate enforces, violated. Carries the remedy so callers can print it. */
class GateError extends Error {
  constructor(message, remedy) {
    super(message);
    this.name = "GateError";
    this.remedy = remedy;
  }
}

function die(message, remedy) {
  throw new GateError(message, remedy);
}

/* ────────────────────────────── manifest ────────────────────────────── */

/**
 * Read and validate the pin manifest. Every rule here exists because breaking
 * it makes the gate's verdict mean less than it appears to.
 */
async function readManifest(root) {
  const path = join(root, "scripts", "vendored.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    die(
      `cannot read scripts/vendored.json (${err.message})`,
      "The vendored copies and the manifest describing them travel together — restore both.",
    );
  }

  const { upstream, entries } = manifest;
  if (!upstream?.repository) {
    die("scripts/vendored.json is missing `upstream.repository`");
  }
  if (!isSha(upstream.ref)) {
    die(
      "scripts/vendored.json `upstream.ref` must be a full 40-character commit SHA, got " +
        JSON.stringify(upstream.ref),
      "A branch name would make the gate's verdict depend on when it ran.",
    );
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    die(
      "scripts/vendored.json declares no vendored entries",
      "An empty manifest reports every copy faithful by comparing nothing.",
    );
  }
  for (const entry of entries) {
    if (!entry?.src || !entry?.dest) {
      die(
        `scripts/vendored.json has an entry missing \`src\` or \`dest\`: ${JSON.stringify(entry)}`,
      );
    }
  }
  return manifest;
}

/**
 * Move `upstream.ref` by rewriting that one string in place.
 *
 * Deliberately textual rather than a re-serialisation of the parsed object.
 * `JSON.stringify` would reflow the whole manifest — collapsing or expanding
 * arrays, re-escaping non-ASCII — so moving a pin would leave the file failing
 * the repo's own format check and bury a one-token change in an unrelated diff.
 * The old ref is a 40-character hex string, and finding anything other than
 * exactly one of it means the file is not what this function assumes.
 */
async function movePin(root, from, to) {
  const path = join(root, "scripts", "vendored.json");
  const text = await readFile(path, "utf8");
  const occurrences = text.split(from).length - 1;
  if (occurrences !== 1) {
    die(
      `expected exactly one occurrence of the current pin in scripts/vendored.json, found ${occurrences}`,
      "Edit `upstream.ref` by hand and re-run without --ref.",
    );
  }
  await writeFile(path, text.replace(from, to));
}

/* ────────────────────────────── upstream ────────────────────────────── */

/**
 * Bind to the upstream checkout and assert the pinned commit is actually in it.
 * A checkout that cannot resolve the pin is an error, never a comparison
 * against whatever it does happen to have.
 */
async function bindUpstream(dir, repository, ref) {
  try {
    await stat(dir);
  } catch {
    die(
      `nanohype checkout not found at ${dir}`,
      `Set NANOHYPE_DIR to a checkout of ${repository}.`,
    );
  }
  try {
    await exec("git", ["-C", dir, "rev-parse", "--git-dir"]);
  } catch (err) {
    die(`${dir} is not a git checkout (${err.message})`, `Point NANOHYPE_DIR at ${repository}.`);
  }
  try {
    await exec("git", ["-C", dir, "cat-file", "-e", `${ref}^{commit}`]);
  } catch {
    die(
      `${ref.slice(0, 12)} is not present in ${dir}`,
      "Fetch it — a shallow clone cannot answer for the pin, so CI needs `fetch-depth: 0`.",
    );
  }
  return { dir, repository, ref };
}

/**
 * The blobs under `path` at `ref`: `{ file, mode }` with `file` relative to
 * `path` (the empty string when `path` is itself a blob). Null when the path
 * does not exist at that commit — a distinction callers turn into an error
 * rather than an empty comparison.
 */
async function treeAt(up, ref, path) {
  let stdout;
  try {
    ({ stdout } = await exec("git", ["-C", up.dir, "ls-tree", "-r", "-z", ref, "--", path], {
      maxBuffer: MAX_BUFFER,
    }));
  } catch (err) {
    die(`cannot list ${path} at ${up.repository}@${ref.slice(0, 12)} (${err.message})`);
  }

  const records = [];
  for (const record of stdout.split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    const name = record.slice(tab + 1);
    records.push({
      file: name === path ? "" : name.slice(path.length + 1),
      mode: record.slice(0, tab).split(" ")[0],
    });
  }
  return records.length > 0 ? records.sort((a, b) => (a.file < b.file ? -1 : 1)) : null;
}

/** One blob at `ref` as a Buffer, or null when the path is absent there. */
async function blobAt(up, ref, path) {
  try {
    const { stdout } = await exec("git", ["-C", up.dir, "show", `${ref}:${path}`], {
      encoding: "buffer",
      maxBuffer: MAX_BUFFER,
    });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Resolve one manifest entry against a ref: the blobs it names, checked against
 * the shape the entry claims. A `dir: true` entry that is a file upstream — or
 * a file entry that is a directory — would otherwise vendor something
 * structurally different from what the manifest describes.
 */
async function resolveEntry(up, ref, entry) {
  const records = await treeAt(up, ref, entry.src);
  if (!records) {
    die(
      `${entry.src} does not exist at ${up.repository}@${ref.slice(0, 12)}`,
      "The path was renamed or removed upstream — update `src`, or pin a commit that has it.",
    );
  }
  const isBlob = records.length === 1 && records[0].file === "";
  if (entry.dir && isBlob) {
    die(`${entry.src} is declared \`"dir": true\` but is a file at ${ref.slice(0, 12)}`);
  }
  if (!entry.dir && !isBlob) {
    die(`${entry.src} is a directory at ${ref.slice(0, 12)} — declare \`"dir": true\``);
  }
  return records;
}

/* ──────────────────────────── local filesystem ──────────────────────── */

/** Recursively list files under `dir`, relative to it, `/`-separated and sorted. */
async function listLocal(dir) {
  const walk = async (at) => {
    const found = [];
    for (const e of await readdir(at, { withFileTypes: true })) {
      const p = join(at, e.name);
      if (e.isDirectory()) found.push(...(await walk(p)));
      else found.push(relative(dir, p).split(sep).join("/"));
    }
    return found;
  };
  return (await walk(dir)).sort();
}

async function readOrNull(path) {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

const destPath = (root, entry, file) =>
  file ? join(root, entry.dest, ...file.split("/")) : join(root, entry.dest);

/* ─────────────────────────────── modes ──────────────────────────────── */

/** Write every blob an entry names, replacing whatever is there. */
async function vendorEntry(up, ref, root, entry) {
  const records = await resolveEntry(up, ref, entry);
  if (entry.dir) await rm(join(root, entry.dest), { recursive: true, force: true });

  for (const record of records) {
    const src = record.file ? `${entry.src}/${record.file}` : entry.src;
    const target = destPath(root, entry, record.file);
    const bytes = await blobAt(up, ref, src);
    if (bytes === null) die(`cannot read ${src} at ${ref.slice(0, 12)}`);
    await mkdir(dirname(target), { recursive: true });
    // The mode comes from the pinned commit rather than from an umask, so an
    // executable upstream stays executable in every copy.
    await writeFile(target, bytes, { mode: record.mode === "100755" ? 0o755 : 0o644 });
  }
  out(`vendored ${entry.dest}`);
}

/** @returns {Promise<number>} drift count for one entry. */
async function checkEntry(up, ref, root, entry) {
  const records = await resolveEntry(up, ref, entry);

  if (!entry.dir) {
    const bytes = await blobAt(up, ref, entry.src);
    const local = await readOrNull(destPath(root, entry, ""));
    if (local !== null && bytes.equals(local)) {
      out(`ok  ${entry.dest}`);
      return 0;
    }
    process.stderr.write(`DRIFT  ${entry.dest} — run \`npm run sync:vendored\`\n`);
    return 1;
  }

  const upstreamFiles = records.map((r) => r.file);
  let localFiles;
  try {
    localFiles = await listLocal(join(root, entry.dest));
  } catch {
    process.stderr.write(
      `DRIFT  ${entry.dest} — missing entirely; run \`npm run sync:vendored\`\n`,
    );
    return 1;
  }

  const missing = upstreamFiles.filter((f) => !localFiles.includes(f));
  const unexpected = localFiles.filter((f) => !upstreamFiles.includes(f));
  const modified = [];
  for (const file of upstreamFiles.filter((f) => localFiles.includes(f))) {
    const bytes = await blobAt(up, ref, `${entry.src}/${file}`);
    const local = await readOrNull(destPath(root, entry, file));
    if (local === null || !bytes.equals(local)) modified.push(file);
  }

  if (missing.length === 0 && unexpected.length === 0 && modified.length === 0) {
    out(`ok  ${entry.dest}`);
    return 0;
  }
  const detail = [
    ...missing.map((f) => `missing ${f}`),
    ...unexpected.map((f) => `unexpected ${f}`),
    ...modified.map((f) => `modified ${f}`),
  ];
  process.stderr.write(
    `DRIFT  ${entry.dest} — run \`npm run sync:vendored\`\n` +
      detail.map((d) => `         ${d}\n`).join(""),
  );
  return 1;
}

/**
 * Files in an exclusive directory that no manifest entry accounts for. They are
 * neither compared nor swept, which is the blind spot the declaration removes.
 */
async function checkExclusive(root, dir, entries) {
  const allowed = new Set(entries.map((e) => e.dest));
  let present;
  try {
    present = await listLocal(join(root, dir));
  } catch {
    return 0;
  }

  let drift = 0;
  for (const file of present) {
    const rel = `${dir}/${file}`;
    if (!allowed.has(rel)) {
      process.stderr.write(
        `DRIFT  ${rel} — not in the vendored manifest (scripts/vendored.json)\n`,
      );
      drift++;
    }
  }
  return drift;
}

/** @returns {Promise<number>} total drift across the manifest. */
async function runCheck(up, ref, root, manifest) {
  let drift = 0;
  for (const entry of manifest.entries) {
    drift += await checkEntry(up, ref, root, entry);
  }
  for (const dir of manifest.exclusiveDirs ?? []) {
    drift += await checkExclusive(root, dir, manifest.entries);
  }
  return drift;
}

/**
 * Report whether the pin is behind the upstream checkout's HEAD, entry by
 * entry. Deliberately not part of `--check`: the answer changes when someone
 * pushes to nanohype, so wiring it into pull-request CI would turn an unrelated
 * upstream commit into a red required check on every open branch here.
 */
async function runFreshness(up, manifest) {
  const { ref } = manifest.upstream;
  const { stdout } = await exec("git", ["-C", up.dir, "rev-parse", "HEAD"]);
  const tip = stdout.trim();
  const behind = [];

  for (const entry of manifest.entries) {
    const atPin = await resolveEntry(up, ref, entry);
    const atTip = await treeAt(up, tip, entry.src);
    if (!atTip) {
      behind.push(`${entry.src} — removed or renamed upstream since the pin`);
      continue;
    }
    if (atPin.map((r) => r.file).join("\n") !== atTip.map((r) => r.file).join("\n")) {
      behind.push(`${entry.src} — files added or removed upstream since the pin`);
      continue;
    }
    for (const { file } of atPin) {
      const path = file ? `${entry.src}/${file}` : entry.src;
      const [pinned, tipped] = await Promise.all([blobAt(up, ref, path), blobAt(up, tip, path)]);
      if (!pinned.equals(tipped)) behind.push(`${path} — changed upstream since the pin`);
    }
  }

  if (behind.length === 0) {
    out(`✓ the pin ${ref.slice(0, 12)} is current with ${up.repository}@${tip.slice(0, 12)}`);
    return 0;
  }

  process.stderr.write(
    `\n  ✗ the pin ${ref.slice(0, 12)} is behind ${up.repository}@${tip.slice(0, 12)}:\n` +
      `${behind.map((b) => `      ${b}`).join("\n")}\n` +
      "\n    Nothing is broken — the vendored copies still match the commit they claim.\n" +
      `    Adopt the newer library when convenient: \`npm run sync:vendored -- --ref=${tip}\`,\n` +
      "    review the diff, and ship it with whatever change it implies.\n\n",
  );
  return 1;
}

/* ────────────────────────────── self-test ───────────────────────────── */

/**
 * Break the inputs every guard above exists to catch, and fail unless each
 * break is rejected. A gate nobody has watched fail is a gate nobody knows
 * still works — and this one decides whether the repositories that vendor from
 * nanohype can merge.
 *
 * Runs against the real upstream checkout at the real pin, vendoring into a
 * scratch root, so it exercises the same git-object read path the blocking gate
 * uses rather than a simulation of it.
 */
async function runSelfTest(up, manifest) {
  const scratch = await mkdtemp(join(tmpdir(), "vendored-selftest-"));
  const cases = [];
  const record = (name, passed, detail) => cases.push({ name, passed, detail });

  /** Run `fn`, expecting the gate to reject it. */
  const expectRejected = async (name, fn) => {
    try {
      await fn();
      record(name, false, "accepted — the guard did not fire");
    } catch (err) {
      record(name, err instanceof GateError, err instanceof GateError ? err.message : String(err));
    }
  };

  const writeManifest = async (at, body) => {
    await mkdir(join(at, "scripts"), { recursive: true });
    await writeFile(join(at, "scripts", "vendored.json"), JSON.stringify(body, null, 2));
    return at;
  };

  const fileEntry = manifest.entries.find((e) => !e.dir) ?? manifest.entries[0];
  const dirEntry = manifest.entries.find((e) => e.dir);
  const base = { upstream: { ...manifest.upstream }, entries: [fileEntry] };

  try {
    for (const [name, mutate] of [
      [
        "a branch name where a commit SHA is required",
        (m) => ({ ...m, upstream: { ...m.upstream, ref: "main" } }),
      ],
      [
        "an abbreviated SHA",
        (m) => ({ ...m, upstream: { ...m.upstream, ref: m.upstream.ref.slice(0, 12) } }),
      ],
      ["a manifest with no `upstream` block", ({ entries }) => ({ entries })],
      ["a manifest that declares no entries", (m) => ({ ...m, entries: [] })],
      ["an entry with no `dest`", (m) => ({ ...m, entries: [{ src: m.entries[0].src }] })],
    ]) {
      const at = await writeManifest(await mkdtemp(join(scratch, "case-")), mutate(base));
      await expectRejected(name, () => readManifest(at));
    }

    await expectRejected("a pin no checkout contains", () =>
      bindUpstream(up.dir, up.repository, "f".repeat(40)),
    );
    await expectRejected("an upstream path that is not a git checkout", () =>
      bindUpstream(scratch, up.repository, up.ref),
    );
    await expectRejected("a source path absent at the pin", () =>
      resolveEntry(up, up.ref, { src: "library/no-such-file.ts", dest: "x" }),
    );
    await expectRejected("a file declared as a directory", () =>
      resolveEntry(up, up.ref, { ...fileEntry, dir: true }),
    );
    if (dirEntry) {
      await expectRejected("a directory declared as a file", () =>
        resolveEntry(up, up.ref, { ...dirEntry, dir: false }),
      );
    }

    // Drift detection, against a real vendor into a scratch root.
    const live = join(scratch, "live");
    await mkdir(live, { recursive: true });
    for (const entry of manifest.entries) await vendorEntry(up, up.ref, live, entry);

    record("a faithful copy set passes", (await runCheck(up, up.ref, live, manifest)) === 0);

    const victim = destPath(live, fileEntry, "");
    const original = await readFile(victim);
    await writeFile(victim, Buffer.concat([original, Buffer.from("\n// edited\n")]));
    record("an edited file is caught", (await runCheck(up, up.ref, live, manifest)) > 0);
    await writeFile(victim, original);

    if (dirEntry) {
      const intruder = destPath(live, dirEntry, "UNDECLARED.txt");
      await writeFile(intruder, "not from upstream\n");
      record(
        "an unexpected file in a vendored tree is caught",
        (await runCheck(up, up.ref, live, manifest)) > 0,
      );
      await rm(intruder);

      const [victimFile] = await listLocal(join(live, dirEntry.dest));
      const victimPath = destPath(live, dirEntry, victimFile);
      const victimBytes = await readFile(victimPath);
      await rm(victimPath);
      record(
        "a deleted file in a vendored tree is caught",
        (await runCheck(up, up.ref, live, manifest)) > 0,
      );
      await writeFile(victimPath, victimBytes);
    }

    for (const dir of manifest.exclusiveDirs ?? []) {
      const stray = join(live, dir, "stray.ts");
      await mkdir(dirname(stray), { recursive: true });
      await writeFile(stray, "export const stray = true;\n");
      record(
        `an undeclared module in ${dir} is caught`,
        (await checkExclusive(live, dir, manifest.entries)) > 0,
      );
      await rm(stray);
    }

    // Moving the pin must touch the pin and nothing else — the whole reason it
    // is a textual replacement rather than a re-serialisation.
    const moveRoot = await writeManifest(await mkdtemp(join(scratch, "move-")), base);
    const before = await readFile(join(moveRoot, "scripts", "vendored.json"), "utf8");
    const target = "a".repeat(40);
    await movePin(moveRoot, base.upstream.ref, target);
    const after = await readFile(join(moveRoot, "scripts", "vendored.json"), "utf8");
    record(
      "moving the pin rewrites the ref and nothing else",
      after === before.replace(base.upstream.ref, target) && after.includes(target),
    );

    await expectRejected("moving a pin that appears more than once", async () => {
      const at = await writeManifest(await mkdtemp(join(scratch, "dup-")), {
        ...base,
        entries: [...base.entries, { src: base.upstream.ref, dest: "x" }],
      });
      await movePin(at, base.upstream.ref, target);
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  const failed = cases.filter((c) => !c.passed);
  out("");
  for (const c of cases) out(`  ${c.passed ? "✓" : "✗"} ${c.name}`);
  if (failed.length > 0) {
    process.stderr.write(
      `\n  ✗ ${failed.length} of ${cases.length} self-test case(s) failed:\n` +
        `${failed.map((c) => `      ${c.name}${c.detail ? ` — ${c.detail}` : ""}`).join("\n")}\n\n`,
    );
    return 1;
  }
  out(`\n✓ all ${cases.length} self-test cases behaved as expected`);
  return 0;
}

/* ──────────────────────────────── main ──────────────────────────────── */

async function main() {
  const argv = process.argv.slice(2);
  const CHECK = argv.includes("--check");
  const FRESHNESS = argv.includes("--freshness");
  const SELF_TEST = argv.includes("--self-test");
  const REF_ARG = argv.find((a) => a.startsWith("--ref="))?.slice("--ref=".length);

  if ([CHECK, FRESHNESS, SELF_TEST, REF_ARG !== undefined].filter(Boolean).length > 1) {
    die("--check, --freshness, --self-test and --ref are mutually exclusive");
  }
  if (REF_ARG !== undefined && !isSha(REF_ARG)) {
    die(`--ref must be a full 40-character commit SHA, got ${JSON.stringify(REF_ARG)}`);
  }

  const manifest = await readManifest(ROOT);
  const { repository } = manifest.upstream;

  // Bound on the pin in every mode, so "can this checkout answer?" is one
  // question with one error message. `--ref` binds again on its own target
  // below, because moving the pin to an unreachable commit is the same defect.
  const up = await bindUpstream(UPSTREAM_DIR, repository, manifest.upstream.ref);

  if (SELF_TEST) process.exit(await runSelfTest(up, manifest));
  if (FRESHNESS) process.exit(await runFreshness(up, manifest));

  if (CHECK) {
    const drift = await runCheck(up, manifest.upstream.ref, ROOT, manifest);
    if (drift > 0) {
      process.stderr.write(
        `\n  ✗ ${drift} vendored surface(s) differ from ${repository}@` +
          `${manifest.upstream.ref.slice(0, 12)}.\n` +
          "\n    Fixes belong upstream in nanohype, with their tests. To adopt a newer library\n" +
          "    here, run `npm run sync:vendored -- --ref=<sha>` and review the diff.\n" +
          "    Never hand-edit a vendored copy.\n\n",
      );
      process.exit(1);
    }
    out(
      `✓ ${manifest.entries.length} vendored surface(s) are byte-identical to ` +
        `${repository}@${manifest.upstream.ref.slice(0, 12)}`,
    );
    return;
  }

  const ref = REF_ARG ?? manifest.upstream.ref;
  if (REF_ARG !== undefined) await bindUpstream(UPSTREAM_DIR, repository, REF_ARG);

  for (const dir of manifest.exclusiveDirs ?? []) {
    await rm(join(ROOT, dir), { recursive: true, force: true });
  }
  for (const entry of manifest.entries) {
    await vendorEntry(up, ref, ROOT, entry);
  }

  if (REF_ARG !== undefined) {
    await movePin(ROOT, manifest.upstream.ref, REF_ARG);
    out(`✓ vendored from ${repository}@${REF_ARG.slice(0, 12)}; pin moved`);
    return;
  }
  out(`✓ vendored from ${repository}@${ref.slice(0, 12)}`);
}

main().catch((err) => {
  if (err instanceof GateError) {
    process.stderr.write(`\n  ✗ ${err.message}\n${err.remedy ? `    ${err.remedy}\n` : ""}\n`);
    process.exit(1);
  }
  process.stderr.write(`\n  ✗ sync-vendored failed: ${err.stack ?? err.message}\n\n`);
  process.exit(1);
});
