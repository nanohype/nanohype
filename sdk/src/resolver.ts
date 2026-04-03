import { VariableResolutionError } from './errors.js';
import type { TemplateVariable } from './types.js';

const MAX_RESOLVE_PASSES = 10;

/**
 * Resolve variable values: apply provided values, fill defaults, expand
 * ${VarName} cross-references, validate enum membership and regex patterns.
 *
 * Returns a flat Record<string, string> of fully resolved values keyed by
 * variable name. Throws VariableResolutionError on missing required values,
 * circular references, invalid enum choices, or pattern mismatches.
 */
export function resolveVariables(
  variables: TemplateVariable[],
  values: Record<string, string | boolean | number>,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  // Apply provided values, then defaults, then type zero-values
  for (const v of variables) {
    if (v.name in values) {
      resolved[v.name] = String(values[v.name]);
    } else if (v.default !== undefined) {
      resolved[v.name] = String(v.default);
    } else if (v.required) {
      throw new VariableResolutionError(
        `Required variable '${v.name}' has no value and no default`,
      );
    } else {
      resolved[v.name] = v.type === 'bool' ? 'false' : v.type === 'int' ? '0' : '';
    }
  }

  // Expand ${VarName} cross-references
  for (let pass = 0; pass < MAX_RESOLVE_PASSES; pass++) {
    let changed = false;
    for (const v of variables) {
      const current = resolved[v.name];
      const replaced = current.replace(/\$\{(\w+)\}/g, (_, ref: string) => {
        if (ref === v.name) {
          throw new VariableResolutionError(`Circular reference in variable '${v.name}'`);
        }
        return resolved[ref] ?? '';
      });
      if (replaced !== current) {
        resolved[v.name] = replaced;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Validate enum membership
  for (const v of variables) {
    if (v.type === 'enum' && v.options && !v.options.includes(resolved[v.name])) {
      throw new VariableResolutionError(
        `Variable '${v.name}' value '${resolved[v.name]}' not in options: ${v.options.join(', ')}`,
      );
    }
  }

  // Validate regex patterns
  for (const v of variables) {
    if (v.validation?.pattern) {
      const regex = new RegExp(`^(?:${v.validation.pattern})$`);
      if (!regex.test(resolved[v.name])) {
        throw new VariableResolutionError(
          v.validation.message ||
            `Variable '${v.name}' value '${resolved[v.name]}' does not match pattern: ${v.validation.pattern}`,
        );
      }
    }
  }

  return resolved;
}
