#!/usr/bin/env node
/**
 * Ratchet over `npm audit --omit=dev` at high/critical. Fails on any advisory
 * not in scripts/npm-audit-baseline.json, and on a baseline entry that no
 * longer appears (delete it — the list may only shrink, never be added to).
 *
 * Fails closed: if npm audit cannot produce a report (registry down, bad
 * lockfile) that is exit 2, never a pass — "could not look" is not "clean".
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compareToBaseline, gatedAdvisories } from './lib/npm-audit-ratchet.mjs';

const BASELINE = 'scripts/npm-audit-baseline.json';

let raw;
try {
  raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 << 20 });
} catch (err) {
  // npm audit exits 1 whenever it finds anything; the report is still on stdout.
  raw = err.stdout;
}

let found;
try {
  const report = JSON.parse(raw || '');
  if (report.error) throw new Error(report.error.summary || JSON.stringify(report.error));
  found = gatedAdvisories(report);
} catch (err) {
  console.error(`npm audit did not produce a usable report: ${err.message}`);
  process.exit(2);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).advisories;
const { added, resolved } = compareToBaseline(found, baseline);

for (const a of added) console.error(`NEW ${a.severity}: ${a.package} — ${a.title}\n  ${a.id}`);
for (const b of resolved) console.error(`RESOLVED (delete from ${BASELINE}): ${b.package} — ${b.id}`);

if (added.length || resolved.length) process.exit(1);
console.log(`npm audit: ${found.size} high/critical advisor${found.size === 1 ? 'y' : 'ies'}, all baselined.`);
