#!/usr/bin/env node
// Cross-checks standards/resource-tagging.json beyond what JSON Schema can express:
// the denormalized required_by_surface lists must agree with dimensions[].
//
//   - aws / azure / gcp: the required set is the EXACT render of every required-tier
//     dimension that applies to that cloud (a full derivation — cloudgov reads it verbatim).
//   - k8s / otel: every listed key must be a real render of some dimension (no typos /
//     orphans); the required subset here is curated, not a full derivation.
//
// Exits non-zero with a precise message on any drift.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, '..', 'standards', 'resource-tagging.json');

const std = JSON.parse(readFileSync(path, 'utf-8'));
const { dimensions, required_by_surface } = std.content;
const errors = [];

const setEq = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

// Full-derivation surfaces: required_by_surface must equal the rendered required dims exactly.
for (const surface of ['aws', 'azure', 'gcp']) {
  const derived = dimensions
    .filter((d) => d.tier === 'required' && d.render[surface] != null)
    .map((d) => d.render[surface]);
  const declared = required_by_surface[surface] ?? [];
  if (!setEq(derived, declared)) {
    errors.push(
      `required_by_surface.${surface} disagrees with dimensions[]:\n` +
        `  derived (required-tier renders): ${[...derived].sort().join(', ')}\n` +
        `  declared:                        ${[...declared].sort().join(', ')}`,
    );
  }
}

// Curated surfaces: every declared key must be a real render of some dimension.
for (const surface of ['k8s', 'otel']) {
  const known = new Set(dimensions.map((d) => d.render[surface]).filter((v) => v != null));
  for (const key of required_by_surface[surface] ?? []) {
    if (!known.has(key)) {
      errors.push(`required_by_surface.${surface} lists "${key}", which no dimension renders.`);
    }
  }
}

// Every required-tier dimension must render on at least one surface (a required tag nobody
// can carry is a mistake).
for (const d of dimensions) {
  if (d.tier === 'required' && Object.values(d.render).every((v) => v == null)) {
    errors.push(`dimension "${d.id}" is required but renders on no surface.`);
  }
}

if (errors.length) {
  console.error('resource-tagging.json consistency check FAILED:\n');
  for (const e of errors) console.error('  - ' + e + '\n');
  process.exit(1);
}
console.log('resource-tagging.json consistency check passed.');
