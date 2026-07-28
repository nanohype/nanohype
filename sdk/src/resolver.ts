import { VariableResolutionError } from "./errors.js";
import type { TemplateVariable } from "./types.js";

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

  // Variables the caller never supplied, so the value under validation came
  // from the template's own default. Carried to the error message: the hardest
  // resolution failure to diagnose is one on a variable you never set, where
  // the value is derived from a variable you did.
  const fromDefault = new Set<string>();

  // Apply provided values, then defaults, then type zero-values
  for (const v of variables) {
    if (v.name in values) {
      resolved[v.name] = String(values[v.name]);
    } else if (v.default !== undefined) {
      resolved[v.name] = String(v.default);
      fromDefault.add(v.name);
    } else if (v.required) {
      throw new VariableResolutionError(
        `Required variable '${v.name}' has no value and no default`,
      );
    } else {
      resolved[v.name] = v.type === "bool" ? "false" : v.type === "int" ? "0" : "";
    }
  }

  // Expand ${VarName} cross-references
  const variableNames = new Set(variables.map((v) => v.name));

  for (let pass = 0; pass < MAX_RESOLVE_PASSES; pass++) {
    let changed = false;
    for (const v of variables) {
      const current = resolved[v.name];
      const replaced = current.replace(/\$\{(\w+)\}/g, (_, ref: string) => {
        if (ref === v.name) {
          throw new VariableResolutionError(`Circular reference in variable '${v.name}'`);
        }
        if (!variableNames.has(ref)) {
          throw new VariableResolutionError(
            `Variable '${v.name}' references unknown variable '${ref}'`,
          );
        }
        return resolved[ref];
      });
      if (replaced !== current) {
        resolved[v.name] = replaced;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Detect indirect circular references (A→B→A) that survived all passes
  for (const v of variables) {
    if (/\$\{\w+\}/.test(resolved[v.name])) {
      throw new VariableResolutionError(
        `Circular reference detected: variable '${v.name}' still contains unresolved references after ${MAX_RESOLVE_PASSES} passes`,
      );
    }
  }

  // Validate enum membership
  for (const v of variables) {
    if (v.type === "enum" && v.options && !v.options.includes(resolved[v.name])) {
      throw new VariableResolutionError(
        `Variable '${v.name}' value '${resolved[v.name]}' not in options: ${v.options.join(", ")}`,
      );
    }
  }

  // Validate regex patterns
  for (const v of variables) {
    if (v.validation?.pattern) {
      const regex = new RegExp(`^(?:${v.validation.pattern})$`);
      if (!regex.test(resolved[v.name])) {
        // A template-authored message explains the RULE; it cannot know which
        // variable or which value tripped it. Previously it replaced the naming
        // rather than adding to it, so `scaffold k8s-app-tenant --var
        // AppName=my-app` failed with a bare "Must be lowercase snake_case"
        // naming nothing — on AppMetric, which the caller never set and which
        // defaults to ${AppName}. Compose instead of choosing.
        const rule = v.validation.message || `does not match pattern: ${v.validation.pattern}`;
        const origin = fromDefault.has(v.name)
          ? ` (defaulted from \`${v.default}\`, not supplied by the caller)`
          : "";
        throw new VariableResolutionError(
          `Variable '${v.name}' value '${resolved[v.name]}'${origin}: ${rule}`,
        );
      }
    }
  }

  return resolved;
}
