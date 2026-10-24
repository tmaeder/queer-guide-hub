#!/usr/bin/env node
/*
 * Suppression ratchet: new eslint-disable / @ts-* suppressions fail CI.
 *
 * src/ carries ~480 eslint-disable comments (most are react-hooks rules, i.e.
 * the likeliest home of stale-state bugs) plus ~26 @ts-expect-error/@ts-nocheck.
 * Burning them down is a separate sweep; this only stops the count growing.
 * Counts are per (file, rule) and compared to scripts/eslint-disable-baseline.json:
 *
 *   - a count ABOVE baseline fails (a new suppression)
 *   - a count BELOW baseline also fails until re-baselined, so a fixed
 *     suppression cannot silently be spent on a new one later (shrink-only)
 *
 *   npm run lint:disables            check
 *   npm run lint:disables:baseline   rewrite the baseline after removing suppressions
 *
 * Only comment directives count: `// eslint-disable…` or `/* eslint-disable…`.
 * A bare disable (no rule list) is counted under "*". Lives under scripts/
 * because the root .gitignore has `/*.json`.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(root, 'scripts', 'eslint-disable-baseline.json');
const SCAN_DIR = 'src';
const EXT = /\.(?:[cm]?[jt]sx?)$/;

const ESLINT_RE = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?(?![\w-])([^\n]*)/g;
const TS_RE = /(?:\/\/|\/\*)\s*(@ts-(?:ignore|expect-error|nocheck))\b/g;

/** Text -> { rule: count }. */
export function countSuppressions(text) {
  const counts = {};
  const add = (rule) => (counts[rule] = (counts[rule] ?? 0) + 1);
  for (const m of text.matchAll(ESLINT_RE)) {
    // Rule list ends at `--` (reason), `*/` (block end) or end of line.
    const list = m[1].split(/--|\*\//)[0];
    // Keep only rule-shaped tokens so a directive quoted inside a string
    // literal does not record its closing quote as part of the rule name.
    const rules = list
      .split(',')
      .map((r) => /^\s*([@\w][\w@\-/.]*)/.exec(r)?.[1])
      .filter(Boolean);
    if (rules.length === 0) add('*');
    else rules.forEach(add);
  }
  for (const m of text.matchAll(TS_RE)) add(m[1]);
  return counts;
}

/** Returns { regressions, shrinks }, each [{ file, rule, was, now }]. */
export function compare(base, now) {
  const regressions = [];
  const shrinks = [];
  for (const file of new Set([...Object.keys(base), ...Object.keys(now)])) {
    const w = base[file] ?? {};
    const n = now[file] ?? {};
    for (const rule of new Set([...Object.keys(w), ...Object.keys(n)])) {
      const was = w[rule] ?? 0;
      const cur = n[rule] ?? 0;
      if (cur > was) regressions.push({ file, rule, was, now: cur });
      else if (cur < was) shrinks.push({ file, rule, was, now: cur });
    }
  }
  return { regressions, shrinks };
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(p, out);
    } else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}

export function scan(dir = join(root, SCAN_DIR)) {
  const files = {};
  for (const p of walk(dir).sort()) {
    const c = countSuppressions(readFileSync(p, 'utf8'));
    if (Object.keys(c).length) {
      files[relative(root, p).replace(/\\/g, '/')] = Object.fromEntries(Object.keys(c).sort().map((r) => [r, c[r]]));
    }
  }
  return files;
}

const total = (files) => Object.values(files).reduce((a, f) => a + Object.values(f).reduce((b, n) => b + n, 0), 0);

function main() {
  const files = scan();
  // Positive control: an empty scan means a broken path, never a clean tree.
  if (Object.keys(files).length === 0) {
    console.error(`lint:disables: found no suppressions under ${SCAN_DIR}/ — scanner is broken, refusing to pass.`);
    process.exit(1);
  }

  if (process.argv.includes('--write')) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ total: total(files), files }, null, 2)}\n`);
    console.log(`Wrote baseline: ${total(files)} suppressions across ${Object.keys(files).length} files.`);
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(`Missing ${BASELINE_PATH}. Run: npm run lint:disables:baseline`);
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const { regressions, shrinks } = compare(baseline.files ?? {}, files);

  if (regressions.length === 0 && shrinks.length === 0) {
    console.log(`lint:disables: ${total(files)} suppressions, none new (baseline ${baseline.total}).`);
    return;
  }
  if (regressions.length) {
    console.error(`\nlint:disables: ${regressions.length} NEW suppression group(s):\n`);
    for (const r of regressions) console.error(`  ${r.file}  ${r.rule}  ${r.was} -> ${r.now}`);
    console.error(`\nFix the underlying lint/type error instead of suppressing it. If a suppression is truly`);
    console.error(`unavoidable, run "npm run lint:disables:baseline" and justify it in the PR.\n`);
  }
  if (shrinks.length) {
    console.error(`\nlint:disables: ${shrinks.length} suppression group(s) removed — lock the improvement in:\n`);
    for (const r of shrinks) console.error(`  ${r.file}  ${r.rule}  ${r.was} -> ${r.now}`);
    console.error(`\nRun "npm run lint:disables:baseline" and commit scripts/eslint-disable-baseline.json.\n`);
  }
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
