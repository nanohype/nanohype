import { NanohypeError } from "./errors.js";
import type { CatalogSource } from "./source.js";
import type { Standard, StandardName, Standards } from "./types.js";

const ALL_STANDARDS: StandardName[] = [
  "language-toolchain",
  "version-currency",
  "platform-tenant-contract",
  "llm-policy",
  "quality-rubric-dimensions",
  "testing-rubric",
  "resource-tagging",
  "resource-naming",
  "observability-slo",
  "telemetry-pipeline",
  "seo-baseline",
];

/** The canonical list of published standards file names. */
export const STANDARD_NAMES: readonly StandardName[] = ALL_STANDARDS;

/** True when `value` names a published standard. */
export function isStandardName(value: unknown): value is StandardName {
  return typeof value === "string" && (STANDARD_NAMES as readonly string[]).includes(value);
}

const EXPECTED_KIND: Record<StandardName, Standard["kind"]> = {
  "language-toolchain": "nanohype/standards/language-toolchain",
  "version-currency": "nanohype/standards/version-currency",
  "platform-tenant-contract": "nanohype/standards/platform-tenant-contract",
  "llm-policy": "nanohype/standards/llm-policy",
  "quality-rubric-dimensions": "nanohype/standards/quality-rubric-dimensions",
  "testing-rubric": "nanohype/standards/testing-rubric",
  "resource-tagging": "nanohype/standards/resource-tagging",
  "resource-naming": "nanohype/standards/resource-naming",
  "observability-slo": "nanohype/standards/observability-slo",
  "telemetry-pipeline": "nanohype/standards/telemetry-pipeline",
  "seo-baseline": "nanohype/standards/seo-baseline",
};

/**
 * Load a single standards file from a source.
 *
 * Validates the `kind` discriminator against the expected value for `name`
 * so a misnamed or corrupted file fails fast rather than producing
 * confusing downstream errors.
 */
export async function loadStandard(source: CatalogSource, name: StandardName): Promise<Standard> {
  const standard = await source.fetchStandard(name);
  const expected = EXPECTED_KIND[name];
  if (standard.kind !== expected) {
    throw new NanohypeError(
      `Standard '${name}' has unexpected kind: ${standard.kind} (expected ${expected})`,
    );
  }
  return standard;
}

/**
 * Load every published standard in a single bundle.
 *
 * Fires the fetches in parallel. The return shape exposes each
 * standard under its canonical name so consumers don't have to remember
 * the `kind` discriminator strings (`bundle['language-toolchain']` rather
 * than scanning the union).
 */
export async function loadStandards(source: CatalogSource): Promise<Standards> {
  // Keyed by name rather than destructured by position. A positional bundle
  // makes ALL_STANDARDS and this function two lists that must agree, and they
  // disagree silently in both directions: a name appended without a binding is
  // fetched and dropped, and a name inserted in the middle shifts every later
  // binding one standard to the left. Neither is a type error unless the
  // shifted types happen to differ, so the failure is a bundle that loads,
  // validates and returns the wrong standard under a right-looking key.
  //
  // Built this way, ALL_STANDARDS is the only list. Adding a standard needs no
  // edit here at all.
  const loaded = await Promise.all(
    ALL_STANDARDS.map(async (name) => [name, await loadStandard(source, name)] as const),
  );
  // Narrowed in one step rather than eleven. `loadStandard` has already checked
  // each value's `kind` against EXPECTED_KIND for its name, so every key holds
  // the standard its slot declares — the guarantee the per-field casts asserted
  // individually and could not enforce. The intermediate `Record` keeps the key
  // type honest: `Object.fromEntries` erases it to `string`, and a cast straight
  // to `Standards` from there would assert over a shape TypeScript can no longer
  // see the keys of.
  const byName = Object.fromEntries(loaded) as Record<StandardName, Standard>;
  return byName as Standards;
}
