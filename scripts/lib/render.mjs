//
// render.mjs — turning a catalog entry into the thing a consumer actually gets.
//
// A skeleton is a template. It carries `__SCREAMING_SNAKE__` placeholders in
// file content and in path segments, and nobody ever runs one: scaffolding
// renders it first. So a check that runs a build, a linter or a compiler over
// `templates/<name>/skeleton` is measuring an artifact that does not ship, and
// what it reports is only as good as the accident of where the placeholders
// fall. `__GO_MODULE__` is a valid Go module path and `__PROJECT_NAME__` sits
// inside a TypeScript string, so those two survive contact with a compiler;
// `__JAVA_PKG__` is not a Java package name and `__PKG_DIR__` is a directory
// segment, so Java does not.
//
// One place for the probing and the writing, so two gates cannot come to
// different views of what a rendered catalog looks like.
//

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Ordered so the first candidate satisfies the widest set of patterns in the
// catalog. Single-word and separator-free is deliberate: several variables
// default to `${SomeOtherVar}` under a stricter pattern than the variable they
// derive from — k8s-app-tenant's AppMetric is `${AppName}` under snake_case,
// and its own description says a multi-word name has to set it explicitly. A
// dashed probe would fail that documented path and report a template defect
// that is not one.
//
// The trade is stated: this prober exercises the default path a single-word
// name takes, so a derived default that only breaks on multi-word input is not
// covered. That is the template's documented contract to keep.
export const CANDIDATES = ["myapp", "my-app", "my_app", "MyApp", "my.app", "1"];

/**
 * A value satisfying the variable's declared constraints, or null if none of
 * the candidates do — in which case the variable, not the render, is at fault.
 */
export function probeValue(variable) {
  if (variable.type === "bool") return "true";
  if (variable.type === "number") return "1";
  const pattern = variable.validation?.pattern;
  if (!pattern) return CANDIDATES[0];
  const re = new RegExp(`^(?:${pattern})$`);
  return CANDIDATES.find((c) => re.test(c)) ?? null;
}

/** Every required-without-default variable, probed. */
export function probeAll(variables, unsatisfiable) {
  const values = {};
  for (const v of variables ?? []) {
    if (!v.required || "default" in v) continue;
    const probed = probeValue(v);
    if (probed === null) {
      unsatisfiable.push(`${v.name} (pattern ${v.validation.pattern})`);
      continue;
    }
    values[v.name] = probed;
  }
  return values;
}

/**
 * Placeholders the renderer should have consumed. Declared placeholders only —
 * a `__SCREAMING_SNAKE__` run in prose that no variable declares is not a
 * rendering failure.
 */
export function survivingPlaceholders(files, variables) {
  const declared = (variables ?? []).map((v) => v.placeholder).filter(Boolean);
  if (declared.length === 0) return [];
  const found = new Set();
  for (const file of files) {
    for (const placeholder of declared) {
      if (file.path.includes(placeholder) || file.content.includes(placeholder)) {
        found.add(placeholder);
      }
    }
  }
  return [...found];
}

/**
 * Render one catalog entry onto disk under `dir`.
 *
 * Returns `{ ok: true, manifest }`, or `{ ok: false, why }` naming what stopped
 * it. A caller running commands in the result wants the same answer a caller
 * checking the render wants, so the failure modes are the same ones and are
 * reported rather than thrown.
 */
export async function renderEntryTo(source, renderTemplate, name, dir) {
  let manifest;
  let files;
  try {
    ({ manifest, files } = await source.fetchTemplate(name));
  } catch (err) {
    return { ok: false, why: `could not be read — ${err.message}` };
  }

  const unsatisfiable = [];
  const values = probeAll(manifest.variables, unsatisfiable);
  if (unsatisfiable.length > 0) {
    return { ok: false, why: `no probe value satisfies ${unsatisfiable.join(", ")}` };
  }

  let rendered;
  try {
    rendered = renderTemplate(manifest, files, values);
  } catch (err) {
    return { ok: false, why: err.message };
  }

  const left = survivingPlaceholders(rendered.files, manifest.variables);
  if (left.length > 0) {
    return { ok: false, why: `rendered output still contains ${left.join(", ")}` };
  }

  for (const file of rendered.files) {
    const target = join(dir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  return { ok: true, manifest };
}
