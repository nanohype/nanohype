#!/usr/bin/env node
// Validate data files (JSON or YAML) against a JSON Schema (draft 2020-12).
//
// Replaces `ajv-cli`, whose pinned js-yaml@3 transitive carries an unpatched
// DoS advisory (no 3.x fix exists) and is incompatible with js-yaml@4. This
// drives the `ajv` library directly with the same contract the validate:* npm
// scripts relied on: --spec=draft2020, --strict=false, one schema, one or more
// data globs, non-zero exit on any failure.
//
//   node scripts/validate-schema.mjs --schema <schema.json> --data <glob> [--data <glob>...]

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';

import _Ajv2020 from 'ajv/dist/2020.js';
import _addFormats from 'ajv-formats';
import jsYaml from 'js-yaml';

const Ajv2020 = _Ajv2020.default ?? _Ajv2020;
const addFormats = _addFormats.default ?? _addFormats;
const parseYaml = jsYaml.load;

function parseArgs(argv) {
  const schema = [];
  const data = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--schema' || argv[i] === '-s') schema.push(argv[++i]);
    else if (argv[i] === '--data' || argv[i] === '-d') data.push(argv[++i]);
  }
  if (schema.length !== 1 || data.length === 0) {
    console.error(
      'usage: validate-schema.mjs --schema <schema.json> --data <glob> [--data <glob>...]',
    );
    process.exit(2);
  }
  return { schema: schema[0], dataGlobs: data };
}

// Minimal glob for `a/*/b`, `a/*.json`, `file` shapes — one `*` per path
// segment, matched against a single directory level. Avoids both a dependency
// and the experimental fs.glob API.
async function expandGlob(pattern) {
  let matches = [''];
  for (const seg of pattern.split('/')) {
    const next = [];
    for (const base of matches) {
      if (seg.includes('*')) {
        const re = new RegExp(
          '^' + seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
        );
        let entries;
        try {
          entries = await readdir(base || '.', { withFileTypes: true });
        } catch {
          continue;
        }
        for (const e of entries)
          if (re.test(e.name)) next.push(base ? `${base}/${e.name}` : e.name);
      } else {
        const p = base ? `${base}/${seg}` : seg;
        if (existsSync(p)) next.push(p);
      }
    }
    matches = next;
  }
  return matches.sort();
}

async function loadDataFile(file) {
  const text = await readFile(file, 'utf8');
  return extname(file) === '.json' ? JSON.parse(text) : parseYaml(text);
}

async function main() {
  const { schema, dataGlobs } = parseArgs(process.argv.slice(2));

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(await readFile(schema, 'utf8')));

  let checked = 0;
  let failures = 0;
  for (const pattern of dataGlobs) {
    for (const file of await expandGlob(pattern)) {
      checked++;
      let data;
      try {
        data = await loadDataFile(file);
      } catch (err) {
        failures++;
        console.error(`✗ ${file}: parse error: ${err.message}`);
        continue;
      }
      if (validate(data)) {
        console.log(`✓ ${file}`);
      } else {
        failures++;
        console.error(`✗ ${file}`);
        for (const e of validate.errors ?? []) {
          console.error(`    ${e.instancePath || '/'} ${e.message}`);
        }
      }
    }
  }

  if (checked === 0) {
    console.error(`no files matched: ${dataGlobs.join(', ')}`);
    process.exit(2);
  }
  if (failures > 0) {
    console.error(`\n${failures} of ${checked} file(s) failed validation`);
    process.exit(1);
  }
  console.log(`\n${checked} file(s) valid`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
