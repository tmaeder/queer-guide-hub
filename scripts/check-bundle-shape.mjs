#!/usr/bin/env node
/**
 * Bundle-shape assertion: prevent admin-only or heavyweight code from
 * leaking into the public-route bundle.
 *
 * Run via `npm run build:check`. CI fails if:
 *   - any chunk whose name starts with a key in PUBLIC_ROUTE_LIMITS
 *     exceeds its KB limit, or
 *   - any `index-*` chunk (the main app shell) contains a string from
 *     FORBIDDEN_IN_PUBLIC.
 *
 * Update the limits intentionally — bumping them silently defeats the check.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist/assets/js';
const files = readdirSync(dist);

const PUBLIC_ROUTE_LIMITS = {
  // chunk-name-prefix: max KB. Set ~10–20% above current size so a single
  // bad import surfaces but normal growth doesn't.
  index: 1500,
  maplibre: 1200,
  vendor: 200,
  router: 80,
  exceljs: 1100,
  tiptap: 700,
  mui: 550,
  pdfjs: 500,
  mammoth: 600,
};

// Strings that must never appear in the eagerly-loaded `index-*` chunks.
// xyflow and PipelineBuilder are admin-only; if they leak, an import path
// regression is dragging the workflow builder into every page load.
const FORBIDDEN_IN_PUBLIC = ['xyflow', 'PipelineBuilder', 'WorkflowDashboard'];

let failed = false;

for (const f of files) {
  if (!f.endsWith('.js')) continue;
  const sizeKb = statSync(join(dist, f)).size / 1024;
  for (const [prefix, limit] of Object.entries(PUBLIC_ROUTE_LIMITS)) {
    if (f.startsWith(prefix + '-') && sizeKb > limit) {
      console.error(
        `::error::Chunk ${f} (${sizeKb.toFixed(0)}KB) exceeds limit ${limit}KB for prefix "${prefix}"`,
      );
      failed = true;
    }
  }
}

const indexChunks = files.filter((f) => f.startsWith('index-') && f.endsWith('.js'));
for (const f of indexChunks) {
  const contents = readFileSync(join(dist, f), 'utf8');
  for (const banned of FORBIDDEN_IN_PUBLIC) {
    if (contents.includes(banned)) {
      console.error(`::error::Public chunk ${f} contains forbidden string "${banned}"`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('Bundle shape check FAILED.');
  process.exit(1);
}

console.log(`Bundle shape OK (${files.filter((f) => f.endsWith('.js')).length} JS chunks scanned).`);
