#!/usr/bin/env node
/*
 * Real typecheck with a baseline ratchet.
 *
 * `npm run typecheck` used to be bare `tsc --noEmit` against the solution-style
 * root tsconfig (`"files": []` + `references`). Without `-b` that compiles ZERO
 * files and always exits 0 — the gate was vacuous in CI and locally for as long
 * as it existed (it did not catch a deleted-but-used import).
 *
 * Checking for real surfaces ~1400 pre-existing errors (a large share are
 * Supabase client type-inference failures, not live bugs), so we cannot fail on
 * the absolute count. Instead we compare per-file / per-error-code counts
 * against scripts/typecheck-baseline.json and fail only on NEW errors.
 *
 *   npm run typecheck            check (fails on regressions)
 *   npm run typecheck:baseline   regenerate the baseline after fixing errors
 *
 * The baseline lives under scripts/ on purpose: the root .gitignore has
 * `/*.json`, so a root-level baseline file would be silently untracked.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(root, 'scripts', 'typecheck-baseline.json');
const PROJECT = process.env.TYPECHECK_PROJECT ?? 'tsconfig.app.json';
const write = process.argv.includes('--write');

// Resolve, don't hardcode: in a git worktree node_modules often lives in the
// parent checkout, and hardcoding ./node_modules made this script report a
// silent, very convincing "0 errors".
let tsc;
try {
  tsc = createRequire(import.meta.url).resolve('typescript/lib/tsc.js');
} catch {
  console.error('Cannot resolve typescript. Run npm install.');
  process.exit(1);
}

const res = spawnSync(process.execPath, [tsc, '-p', PROJECT, '--noEmit', '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});

if (res.error) {
  console.error(`Failed to run tsc: ${res.error.message}`);
  process.exit(1);
}

/** file -> { [TSxxxx]: count }; errors with no file position land under "". */
const counts = {};
let total = 0;
const lineRe = /^(?:(.+?)\((\d+),(\d+)\): )?error (TS\d+): /;
for (const line of `${res.stdout}${res.stderr}`.split('\n')) {
  const m = lineRe.exec(line);
  if (!m) continue;
  const file = (m[1] ?? '').replace(/\\/g, '/');
  const code = m[4];
  counts[file] ??= {};
  counts[file][code] = (counts[file][code] ?? 0) + 1;
  total += 1;
}

// A non-zero exit with nothing parsed means tsc itself blew up (bad config,
// crash, OOM) — never treat that as a clean run.
if (res.status !== 0 && total === 0) {
  console.error(`tsc exited ${res.status} without reportable diagnostics:\n${res.stdout}${res.stderr}`);
  process.exit(1);
}

const sorted = Object.fromEntries(
  Object.keys(counts)
    .sort()
    .map((f) => [f, Object.fromEntries(Object.keys(counts[f]).sort().map((c) => [c, counts[f][c]]))]),
);

if (write) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ project: PROJECT, total, files: sorted }, null, 2)}\n`);
  console.log(`Wrote baseline: ${total} errors across ${Object.keys(sorted).length} files.`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error(`Missing ${BASELINE_PATH}. Run: npm run typecheck:baseline`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const base = baseline.files ?? {};

const regressions = [];
const improvements = [];
for (const file of new Set([...Object.keys(base), ...Object.keys(sorted)])) {
  const now = sorted[file] ?? {};
  const was = base[file] ?? {};
  for (const code of new Set([...Object.keys(was), ...Object.keys(now)])) {
    const n = now[code] ?? 0;
    const w = was[code] ?? 0;
    if (n > w) regressions.push({ file, code, was: w, now: n });
    else if (n < w) improvements.push({ file, code, was: w, now: n });
  }
}

if (regressions.length === 0) {
  console.log(`typecheck: ${total} errors, none new (baseline ${baseline.total}).`);
  if (improvements.length > 0) {
    const fixed = improvements.reduce((a, i) => a + (i.was - i.now), 0);
    console.log(
      `${fixed} baseline error(s) fixed in ${new Set(improvements.map((i) => i.file)).size} file(s) — ` +
        `run "npm run typecheck:baseline" to lock the improvement in.`,
    );
  }
  process.exit(0);
}

console.error(`\ntypecheck: ${regressions.length} NEW type error group(s):\n`);
for (const r of regressions.slice(0, 60)) {
  console.error(`  ${r.file || '<no file>'}  ${r.code}  ${r.was} -> ${r.now}`);
}
if (regressions.length > 60) console.error(`  ... and ${regressions.length - 60} more`);

const files = new Set(regressions.map((r) => r.file));
console.error(`\nFull output for the affected file(s):\n`);
for (const line of `${res.stdout}${res.stderr}`.split('\n')) {
  const m = lineRe.exec(line);
  if (m && files.has((m[1] ?? '').replace(/\\/g, '/'))) console.error(`  ${line}`);
}
console.error(
  `\nFix them, or if they are unavoidable and pre-existing, run "npm run typecheck:baseline" and explain why in the PR.\n`,
);
process.exit(1);
