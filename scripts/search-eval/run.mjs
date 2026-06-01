#!/usr/bin/env node
/**
 * Offline relevance eval harness for the Postgres `search_hybrid` RPC
 * (Meili -> Postgres migration plan §8.2).
 *
 * Runs a curated golden set + a zero-hit probe against the live RPC and fails
 * (exit 1) on regressions, so it can gate the Meili -> PG cutover and guard
 * against silent ranking drift afterwards.
 *
 * Keyword-only (p_query_vec = null) so results are deterministic without a
 * Workers-AI embedding round-trip — this exercises the FTS + trigram + ranking
 * legs, which is what the title/known-item assertions target.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/search-eval/run.mjs
 *
 * Skips gracefully (exit 0) when the env vars are absent, so the opt-in
 * workflow stays green in repos/forks without the secret configured.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

if (!URL_BASE || !KEY) {
	console.log("[search-eval] SUPABASE_URL / SUPABASE_SERVICE_KEY not set — skipping (exit 0).");
	process.exit(0);
}

const golden = JSON.parse(readFileSync(join(__dirname, "golden.json"), "utf8"));
const norm = (s) => String(s ?? "").trim().toLowerCase();

async function searchHybrid(q, types, { limit = 10 } = {}) {
	const t0 = Date.now();
	const res = await fetch(`${URL_BASE}/rest/v1/rpc/search_hybrid`, {
		method: "POST",
		headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" },
		body: JSON.stringify({
			p_query: q,
			p_query_vec: null,
			p_content_types: types ?? null,
			p_filters: {},
			p_limit: limit,
			p_offset: 0,
		}),
	});
	if (!res.ok) throw new Error(`search_hybrid ${res.status}: ${await res.text()}`);
	const body = await res.json();
	return { hits: body?.hits ?? [], total: body?.total ?? 0, ms: Date.now() - t0 };
}

function matches(hit, expect) {
	if (expect.title && norm(hit.title) !== norm(expect.title)) return false;
	if (expect.city && norm(hit.city) !== norm(expect.city)) return false;
	return true;
}

let failures = 0;
const latencies = [];

// Contract guard — fail fast if search_hybrid lost the target_groups filter or
// regained the vnn OR-subquery seq-scan admission (both have regressed several
// times from rewrites based on stale copies). Backed by the SQL function
// public.assert_search_hybrid_contract(), which RAISES on either.
console.log("\n=== Contract ===");
{
	const res = await fetch(`${URL_BASE}/rest/v1/rpc/assert_search_hybrid_contract`, {
		method: "POST",
		headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" },
		body: "{}",
	});
	const msg = (await res.text()).trim().replace(/^"|"$/g, "");
	if (!res.ok) {
		console.error(`  FAIL  search_hybrid contract: ${msg}`);
		process.exit(1);
	}
	console.log(`  PASS  ${msg}`);
}

console.log("\n=== Golden cases ===");
for (const c of golden.cases) {
	const { hits, ms } = await searchHybrid(c.q, c.types, { limit: Math.max(10, c.expect?.maxRank ?? 10) });
	latencies.push(ms);
	const e = c.expect ?? {};
	let ok = true;
	let detail = "";

	if (e.minResults != null) {
		const pool = e.city ? hits.filter((h) => norm(h.city) === norm(e.city)) : hits;
		ok = pool.length >= e.minResults;
		detail = `${pool.length} results (need >=${e.minResults}${e.city ? ` in ${e.city}` : ""})`;
	} else {
		const idx = hits.findIndex((h) => matches(h, e));
		const rank = idx >= 0 ? idx + 1 : null;
		ok = rank != null && rank <= (e.maxRank ?? 10);
		detail = rank ? `rank ${rank} (need <=${e.maxRank})` : "not found";
	}
	if (!ok) failures++;
	console.log(`  ${ok ? "PASS" : "FAIL"}  "${c.q}" — ${detail}  [${ms}ms]`);
}

console.log("\n=== Zero-hit probe ===");
let zeroHits = 0;
for (const q of golden.zeroHitProbe) {
	const { total, ms } = await searchHybrid(q, ["venue", "event"], { limit: 1 });
	latencies.push(ms);
	if (total === 0) {
		zeroHits++;
		console.log(`  ZERO  "${q}"`);
	}
}
const zeroHitRate = zeroHits / golden.zeroHitProbe.length;

latencies.sort((a, b) => a - b);
const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0;
const t = golden.thresholds;

console.log("\n=== Summary ===");
console.log(`  golden failures : ${failures}`);
console.log(`  zero-hit rate   : ${(zeroHitRate * 100).toFixed(1)}% (max ${(t.maxZeroHitRate * 100).toFixed(0)}%)`);
console.log(`  p95 latency     : ${p95}ms (max ${t.p95LatencyMs}ms)`);

let exit = 0;
if (failures > 0) { console.error("FAIL: golden cases regressed"); exit = 1; }
if (zeroHitRate > t.maxZeroHitRate) { console.error("FAIL: zero-hit rate above threshold"); exit = 1; }
if (p95 > t.p95LatencyMs) { console.error("FAIL: p95 latency above threshold"); exit = 1; }
console.log(exit === 0 ? "\nOK\n" : "\nREGRESSION\n");
process.exit(exit);
