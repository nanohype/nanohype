import { readFile, readdir } from "fs/promises";
import { join, resolve } from "path";
import { parse as parseYaml } from "yaml";
import Ajv from "ajv";

const PROMPTS_DIR = resolve(import.meta.dirname, "../prompts");
const SCHEMA_PATH = resolve(import.meta.dirname, "../schema/prompt.schema.json");

interface ValidationResult {
  file: string;
  passed: boolean;
  errors: string[];
}

/**
 * Parse YAML frontmatter from a prompt file.
 */
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return parseYaml(match[1]) as Record<string, unknown>;
}

/**
 * Recursively find all .yaml and .yml files in a directory.
 */
async function findYamlFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findYamlFiles(fullPath)));
    } else if (/\.ya?ml$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check that no required variable has a circular default reference.
 */
function checkCircularDefaults(
  variables: Array<{ name: string; default?: string }> | undefined
): string[] {
  if (!variables) return [];
  const errors: string[] = [];
  const defaults = new Map<string, string>();

  for (const v of variables) {
    if (v.default !== undefined) {
      defaults.set(v.name, v.default);
    }
  }

  // Check each variable for circular default references
  for (const v of variables) {
    if (v.default === undefined) continue;

    const visited = new Set<string>();
    let current = v.name;

    while (current && defaults.has(current)) {
      if (visited.has(current)) {
        errors.push(
          `Circular default reference detected: ${[...visited, current].join(" -> ")}`
        );
        break;
      }
      visited.add(current);

      // Extract variable references like ${VarName} from the default
      const refMatch = defaults.get(current)?.match(/\$\{(\w+)\}/);
      current = refMatch ? refMatch[1] : "";
    }
  }

  return errors;
}

async function main(): Promise<void> {
  console.log("Validating prompt files...\n");

  // Load schema
  const schemaRaw = await readFile(SCHEMA_PATH, "utf-8");
  const schema = JSON.parse(schemaRaw);
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  // Find all prompt YAML files
  const files = await findYamlFiles(PROMPTS_DIR);

  if (files.length === 0) {
    console.log("No prompt files found in", PROMPTS_DIR);
    process.exit(1);
  }

  const results: ValidationResult[] = [];

  for (const file of files) {
    const relativePath = file.replace(PROMPTS_DIR + "/", "");
    const result: ValidationResult = { file: relativePath, passed: true, errors: [] };

    try {
      const content = await readFile(file, "utf-8");
      const metadata = parseFrontmatter(content);

      if (!metadata) {
        result.passed = false;
        result.errors.push("Missing or invalid YAML frontmatter (expected --- delimiters)");
        results.push(result);
        continue;
      }

      // Validate against JSON Schema
      if (!validate(metadata)) {
        result.passed = false;
        for (const err of validate.errors ?? []) {
          result.errors.push(`${err.instancePath || "/"}: ${err.message}`);
        }
      }

      // Check for circular defaults
      const circularErrors = checkCircularDefaults(
        metadata.variables as Array<{ name: string; default?: string }> | undefined
      );
      if (circularErrors.length > 0) {
        result.passed = false;
        result.errors.push(...circularErrors);
      }
    } catch (err) {
      result.passed = false;
      result.errors.push(`Error reading file: ${(err as Error).message}`);
    }

    results.push(result);
  }

  // Report results
  let failures = 0;
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    console.log(`  ${status}  ${r.file}`);
    if (!r.passed) {
      failures++;
      for (const e of r.errors) {
        console.log(`         ${e}`);
      }
    }
  }

  console.log(`\n${results.length} files checked, ${failures} failed.`);

  if (failures > 0) {
    process.exit(1);
  }
}

main();
