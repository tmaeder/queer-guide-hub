#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const baseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceKey) {
  console.error(
    '✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; city quality probe did not run',
  );
  process.exit(1);
}

const baseline = JSON.parse(
  await readFile(new URL('./city-quality-baseline.json', import.meta.url), 'utf8'),
);
const response = await fetch(`${baseUrl}/rest/v1/rpc/city_quality_scorecard`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});

if (!response.ok) {
  console.error(
    `✗ city_quality_scorecard unreadable (HTTP ${response.status}); this is not zero findings`,
  );
  process.exit(1);
}

const scorecard = await response.json();
if (
  scorecard?.probe_ok !== true ||
  !scorecard.totals ||
  !scorecard.issues ||
  !scorecard.operations
) {
  console.error('✗ city_quality_scorecard returned an incomplete probe; this is not zero findings');
  process.exit(1);
}

const regressions = [];
const blocked = Number(scorecard.totals.publication_blocked);
if (!Number.isFinite(blocked) || blocked > baseline.publication_blocked) {
  regressions.push(`publication_blocked=${blocked} > ${baseline.publication_blocked}`);
}

for (const [code, ceiling] of Object.entries(baseline.issues)) {
  const actual = Number(scorecard.issues[code] ?? 0);
  if (!Number.isFinite(actual) || actual > ceiling)
    regressions.push(`${code}=${actual} > ${ceiling}`);
}
for (const [metric, ceiling] of Object.entries(baseline.operations)) {
  const actual = Number(scorecard.operations[metric]);
  if (!Number.isFinite(actual) || actual > ceiling)
    regressions.push(`${metric}=${actual} > ${ceiling}`);
}

if (regressions.length > 0) {
  console.error('✗ City quality regressed beyond a shrinking backlog ceiling:');
  for (const regression of regressions) console.error(`  - ${regression}`);
  process.exit(1);
}

if (scorecard.automation?.fresh !== true) {
  console.warn('⚠ City quality sync is stale or has not completed yet');
}
console.log(
  `✓ City quality gate: ${scorecard.totals.publication_ready} ready, ${blocked} blocked; probe completed`,
);
