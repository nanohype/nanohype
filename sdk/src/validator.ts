import { ManifestValidationError } from './errors.js';
import type { CompositeManifest, TemplateManifest } from './types.js';

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

  // Conditionals must reference bool variables
  for (const cond of manifest.conditionals ?? []) {
    const ref = manifest.variables.find((v) => v.name === cond.when);
    if (!ref) {
      throw new ManifestValidationError(
        `Conditional references unknown variable '${cond.when}'`,
      );
    }
    if (ref.type !== 'bool') {
      throw new ManifestValidationError(
        `Conditional 'when' must reference bool variable, got '${ref.type}' for '${cond.when}'`,
      );
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
