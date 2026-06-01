#!/usr/bin/env node
/**
 * Shadow-mode log analyzer for the Meili -> Postgres search cutover (plan §8.2,
 * runbook `docs/deploy/search-rollout.md` Stage A).
 *
 * When the Worker runs with SEARCH_BACKEND=shadow it serves Meili to users and
 * logs one comparison line per `/search`:
 *
 *   {"tag":"search_shadow","q":"berlin","overlap_at_10":7,
 *    "meili_top":[...],"pg_top":[...],"pg_total":179,"pg_ms":120}
 *
 * This reads those lines (from a file arg or stdin), tolerating raw JSON objects
 * or `wrangler tail` lines that merely *contain* the JSON, and prints a go/no-go
 * read against the cutover gate:
 *
 *   - median overlap_at_10  ≳ 6-7
 *   - near-zero pg_total=0 where Meili returned hits (a real divergence)
 *   - pg_ms p95 within ~500ms
 *   - the worst-overlap queries to eyeball (PG should be different-but-fine)
 *
 * Exit code is 0 when the gate passes, 1 when it fails, 2 on no usable input —
 * so it can gate a cutover step in CI if desired.
 *
 * Usage:
 *   node scripts/search-eval/shadow-analyze.mjs shadow.log
 *   wrangler tail queer-guide-search-proxy --format json | node scripts/search-eval/shadow-analyze.mjs
 */

import { readFileSync } from "node:fs";

// Gate thresholds (keep in sync with docs/deploy/search-rollout.md Stage A).
const GATE = {
  medianOverlap: 6, // median overlap_at_10 must be >= this
  maxZeroDivergencePct: 1, // % of (pg_total=0 while Meili had hits) must be <= this
  p95MsBudget: 500, // pg_ms p95 must be <= this
};

function readInput() {
  const fileArg = process.argv[2];
  if (fileArg) return readFileSync(fileArg, "utf8");
  try {
    return readFileSync(0, "utf8"); // stdin
  } catch {
    return "";
  }
}

/** Pull every {"tag":"search_shadow",...} object out of mixed log text. */
function extractEvents(text) {
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("search_shadow")) continue;
    // A tail line may wrap the JSON in other text; scan for balanced {...} spans.
    for (let i = line.indexOf("{"); i !== -1; i = line.indexOf("{", i + 1)) {
      let depth = 0;
      for (let j = i; j < line.length; j++) {
        if (line[j] === "{") depth++;
        else if (line[j] === "}") {
          depth--;
          if (depth === 0) {
            const span = line.slice(i, j + 1);
            try {
              const obj = JSON.parse(span);
              if (obj && obj.tag === "search_shadow") events.push(obj);
            } catch {
              /* not the JSON we want */
            }
            i = j;
            break;
          }
        }
      }
    }
  }
  return events;
}

const quantile = (sorted, q) => {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const median = (xs) => quantile([...xs].sort((a, b) => a - b), 0.5);

function meiliHadHits(e) {
  if (Array.isArray(e.meili_top)) return e.meili_top.length > 0;
  if (typeof e.meili_total === "number") return e.meili_total > 0;
  return true; // shadow only fires on the fusion path, which had Meili hits
}

function main() {
  const events = extractEvents(readInput());
  if (events.length === 0) {
    console.error("No search_shadow events found. Pass a log file or pipe `wrangler tail` output.");
    process.exit(2);
  }

  const overlaps = events.map((e) => Number(e.overlap_at_10)).filter((n) => Number.isFinite(n));
  const latencies = events.map((e) => Number(e.pg_ms)).filter((n) => Number.isFinite(n));
  const zeroDivergences = events.filter((e) => Number(e.pg_total) === 0 && meiliHadHits(e));

  const sortedLat = [...latencies].sort((a, b) => a - b);
  const medOverlap = median(overlaps);
  const zeroPct = (zeroDivergences.length / events.length) * 100;
  const p50 = quantile(sortedLat, 0.5);
  const p95 = quantile(sortedLat, 0.95);

  // overlap histogram 0..10
  const hist = Array(11).fill(0);
  for (const o of overlaps) if (o >= 0 && o <= 10) hist[Math.round(o)]++;

  const worst = [...events]
    .filter((e) => Number.isFinite(Number(e.overlap_at_10)))
    .sort((a, b) => a.overlap_at_10 - b.overlap_at_10)
    .slice(0, 10);

  const pass = {
    overlap: medOverlap >= GATE.medianOverlap,
    zero: zeroPct <= GATE.maxZeroDivergencePct,
    latency: p95 <= GATE.p95MsBudget,
  };
  const verdict = pass.overlap && pass.zero && pass.latency;

  const ok = (b) => (b ? "PASS" : "FAIL");
  console.log(`\nsearch_shadow analysis — ${events.length} queries\n${"=".repeat(40)}`);
  console.log(`median overlap@10 : ${medOverlap.toFixed(1)} / 10   [${ok(pass.overlap)} ≥ ${GATE.medianOverlap}]`);
  console.log(`mean   overlap@10 : ${(overlaps.reduce((a, b) => a + b, 0) / overlaps.length).toFixed(2)}`);
  console.log(`pg_total=0 vs Meili-hits : ${zeroDivergences.length} (${zeroPct.toFixed(2)}%)   [${ok(pass.zero)} ≤ ${GATE.maxZeroDivergencePct}%]`);
  console.log(`pg_ms p50 / p95 / max : ${p50.toFixed(0)} / ${p95.toFixed(0)} / ${sortedLat[sortedLat.length - 1] ?? 0}   [p95 ${ok(pass.latency)} ≤ ${GATE.p95MsBudget}ms]`);
  console.log(`\noverlap@10 histogram (count per bucket 0..10):`);
  hist.forEach((c, i) => console.log(`  ${String(i).padStart(2)} | ${"█".repeat(Math.round((c / events.length) * 40))} ${c}`));
  if (worst.length) {
    console.log(`\nlowest-overlap queries to spot-check:`);
    for (const e of worst) console.log(`  overlap=${e.overlap_at_10}  pg_total=${e.pg_total}  pg_ms=${e.pg_ms}  q=${JSON.stringify(e.q)}`);
  }
  console.log(`\n${"=".repeat(40)}\nVERDICT: ${verdict ? "GO ✅ — gate met" : "NO-GO ❌ — see FAIL rows above"}\n`);

  process.exit(verdict ? 0 : 1);
}

main();
