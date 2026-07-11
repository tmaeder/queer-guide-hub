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
  // `vendor` is React core only (react + react-dom + scheduler — see the
  // manualChunks rule in vite.config.ts). react-dom 19 is ~360KB raw and can't
  // be split, so the old 200KB cap was unreachable and failed every PR. Capped
  // ~15% above current real size to still catch a stray heavy import landing in
  // React core. Verified contents are React-only (no admin/heavy libs leaked).
  vendor: 420,
  router: 80,
  exceljs: 1100,
  tiptap: 700,
  mui: 550,
  pdfjs: 500,
  mammoth: 600,
  // After PR replacing `import * as Icons from 'lucide-react'` with an
  // explicit icon registry, lucide chunk dropped from ~606 KB raw to
  // ~72 KB raw. Cap set ~40% above current so adding a few icons to the
  // registry is fine but a regression to the wildcard pattern fails.
  lucide: 100,
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

// ── Entry static-import closure ─────────────────────────────────────────
// Walk the STATIC import edges (import ... from "./chunk-hash.js") from the
// entry chunk(s). Everything in this closure is fetched by every page load —
// modulePreload filtering does NOT help here, these are real ESM imports.
// Heavy route-only chunks must never become reachable (the clsx-in-recharts
// homing bug made entry → utils → recharts → graph + tiptap; see
// docs/perf/recharts-cross-route-leak.md).
const HEAVY_UNREACHABLE = /^(recharts|tiptap|graph|exceljs|pdfjs|mammoth|maplibre|xyflow|dnd-kit)-/;

const importRe = /from\s*"\.\/([A-Za-z0-9._-]+\.js)"|import\s*"\.\/([A-Za-z0-9._-]+\.js)"/g;
const closure = new Set();
const queue = [...indexChunks];
while (queue.length) {
  const f = queue.pop();
  if (closure.has(f)) continue;
  closure.add(f);
  let contents;
  try {
    contents = readFileSync(join(dist, f), 'utf8');
  } catch {
    continue;
  }
  for (const m of contents.matchAll(importRe)) {
    const dep = m[1] || m[2];
    if (dep && !closure.has(dep)) queue.push(dep);
  }
}

let closureKb = 0;
for (const f of closure) {
  try {
    closureKb += statSync(join(dist, f)).size / 1024;
  } catch {
    /* removed between listing and stat — ignore */
  }
  if (HEAVY_UNREACHABLE.test(f)) {
    console.error(
      `::error::Heavy route-only chunk ${f} is statically reachable from the entry — every page fetches it. A shared module is being homed in a heavy chunk again (see docs/perf/recharts-cross-route-leak.md).`,
    );
    failed = true;
  }
}

// Raw-size budget for the whole entry closure (everything every page fetches).
// Baseline 2026-07-11: ~2.1 MB raw after the clsx re-homing fix. Headroom for
// normal growth; a jump past this means a heavy import leaked into the shell.
const ENTRY_CLOSURE_LIMIT_KB = 2600;
if (closureKb > ENTRY_CLOSURE_LIMIT_KB) {
  console.error(
    `::error::Entry static-import closure is ${closureKb.toFixed(0)}KB raw (limit ${ENTRY_CLOSURE_LIMIT_KB}KB). Something heavy joined the every-page graph.`,
  );
  failed = true;
}

if (failed) {
  console.error('Bundle shape check FAILED.');
  process.exit(1);
}

console.log(
  `Bundle shape OK (${files.filter((f) => f.endsWith('.js')).length} JS chunks scanned; entry closure ${closure.size} chunks / ${closureKb.toFixed(0)}KB raw).`,
);
