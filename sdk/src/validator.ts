import { conditionVariables } from './conditions.js';
import { ManifestValidationError } from './errors.js';
import type { CompositeManifest, TemplateManifest } from './types.js';

/**
 * The kebab-case shape every catalog entry name (template or composite)
 * must satisfy — the same pattern `schemas/template.schema.json` and the
 * template contract enforce on `name`. Sources interpolate these names
 * into filesystem paths and request URLs, so the shape check doubles as
 * an injection guard: it admits no `/`, `.`, null bytes, or uppercase.
 */
export const CATALOG_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** True when `value` is a well-formed kebab-case catalog (template/composite) name. */
export function isCatalogName(value: unknown): value is string {
  return typeof value === 'string' && CATALOG_NAME_PATTERN.test(value);
}

/**
 * Validate a template manifest's structural invariants.
 * Throws ManifestValidationError on the first violation found.
 */
export function validateManifest(manifest: TemplateManifest): void {
  if (manifest.apiVersion !== 'nanohype/v1') {
    throw new ManifestValidationError(`Unsupported apiVersion: ${manifest.apiVersion}`);
  }

  // Enum variables must have options
  for (const v of manifest.variables) {
    if (v.type === 'enum' && (!v.options || v.options.length === 0)) {
      throw new ManifestValidationError(`Enum variable '${v.name}' has no options`);
    }
  }

  // Conditionals' `when` is a boolean expression; every variable it references
  // must exist and be a bool.
  for (const cond of manifest.conditionals ?? []) {
    for (const name of conditionVariables(cond.when)) {
      const ref = manifest.variables.find((v) => v.name === name);
      if (!ref) {
        throw new ManifestValidationError(
          `Conditional 'when' references unknown variable '${name}' (in '${cond.when}')`,
        );
      }
      if (ref.type !== 'bool') {
        throw new ManifestValidationError(
          `Conditional 'when' must reference bool variables, got '${ref.type}' for '${name}'`,
        );
      }
    }
  }

  // Placeholders must be unique and no placeholder may be a substring of another
  const placeholders = manifest.variables.map((v) => v.placeholder);
  const seen = new Set<string>();
  for (const p of placeholders) {
    if (seen.has(p)) {
      throw new ManifestValidationError(`Duplicate placeholder: ${p}`);
    }
    seen.add(p);
  }
  for (let i = 0; i < placeholders.length; i++) {
    for (let j = 0; j < placeholders.length; j++) {
      if (i !== j && placeholders[j].includes(placeholders[i])) {
        throw new ManifestValidationError(
          `Placeholder '${placeholders[i]}' is a substring of '${placeholders[j]}' — substitution order would corrupt output`,
        );
      }
    }
  }

  // Default values must match their declared type
  for (const v of manifest.variables) {
    if (v.default === undefined) continue;
    const d = v.default;
    switch (v.type) {
      case 'bool':
        if (typeof d !== 'boolean' && d !== 'true' && d !== 'false') {
          throw new ManifestValidationError(
            `Variable '${v.name}' is type bool but default is '${d}'`,
          );
        }
        break;
      case 'int':
        if (typeof d !== 'number' || !Number.isInteger(d)) {
          if (typeof d === 'string' && /^\d+$/.test(d)) break;
          throw new ManifestValidationError(
            `Variable '${v.name}' is type int but default is '${d}'`,
          );
        }
        break;
      case 'enum':
        if (v.options && !v.options.includes(String(d))) {
          throw new ManifestValidationError(
            `Variable '${v.name}' default '${d}' not in options: ${v.options.join(', ')}`,
          );
        }
        break;
    }
  }
}

/**
 * Validate a composite manifest's structural invariants.
 */
export function validateCompositeManifest(manifest: CompositeManifest): void {
  if (manifest.apiVersion !== 'nanohype/v1') {
    throw new ManifestValidationError(`Unsupported apiVersion: ${manifest.apiVersion}`);
  }
  if (manifest.kind !== 'composite') {
    throw new ManifestValidationError(`Expected kind 'composite', got '${manifest.kind}'`);
  }
}
