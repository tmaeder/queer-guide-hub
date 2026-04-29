/**
 * Postgres-backed synonyms for query expansion.
 *
 * search_synonyms is the source of truth (introduced in #147, populated in
 * #151 + #153). This module fetches the active subset on cold start, caches
 * in Worker KV (5 min TTL), and exposes a query-expansion helper that
 * appends matching replacements to the search string.
 *
 * Augments — does not replace — the LLM rewrite synonyms in rewrite.ts.
 * Both contributions are deduped before query construction.
 */

import type { Env } from "./index";

const KV_KEY = "synonyms:active:v1";
const KV_TTL_SECONDS = 300; // 5 minutes

export interface PgSynonym {
	terms: string[];
	replacements: string[];
	is_one_way: boolean;
	indexes: string[];
	locale: string;
}

/**
 * Load active synonyms with KV cache. Stale-while-revalidate not implemented;
 * a cache miss does a fresh fetch and writes to KV. Reads are fast (≤5ms KV
 * hit, ≤80ms Supabase miss). On Supabase failure, returns an empty array
 * (fail-open).
 */
export async function loadActiveSynonyms(env: Env): Promise<PgSynonym[]> {
	try {
		const cached = await env.SESSION_CACHE.get(KV_KEY, "json");
		if (cached && Array.isArray(cached)) return cached as PgSynonym[];
	} catch {
		// KV transient issue — fall through to fresh fetch.
	}
	let rows: PgSynonym[] = [];
	try {
		const res = await fetch(
			`${env.SUPABASE_URL}/rest/v1/search_synonyms?select=terms,replacements,is_one_way,indexes,locale&status=eq.active`,
			{
				headers: {
					apikey: env.SUPABASE_SERVICE_KEY,
					authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
				},
			},
		);
		if (res.ok) {
			rows = (await res.json()) as PgSynonym[];
		} else {
			console.warn("loadActiveSynonyms: supabase", res.status, await res.text());
		}
	} catch (e) {
		console.warn("loadActiveSynonyms: fetch failed", e);
	}
	// Best-effort cache write.
	try {
		await env.SESSION_CACHE.put(KV_KEY, JSON.stringify(rows), {
			expirationTtl: KV_TTL_SECONDS,
		});
	} catch {
		// quota / transient — ignore.
	}
	return rows;
}

/**
 * Expand a query string by adding active-synonym replacements whose `terms[]`
 * match a substring of the query (case-insensitive). Filters by index and
 * optional locale: a synonym row applies when its `indexes` is empty (all)
 * or includes the target index, AND its `locale` is '*' or matches.
 *
 * Returns the deduped list of terms to append. Caller decides how to splice
 * them into the Meili query string.
 *
 * Bidirectional rows (is_one_way=false) match either direction: query word
 * in terms triggers append of replacements; query word in replacements
 * triggers append of terms.
 */
export function expandWithPgSynonyms(
	query: string,
	synonyms: PgSynonym[],
	opts: { index?: string; locale?: string } = {},
): string[] {
	if (!query || !synonyms.length) return [];
	const lcQuery = ` ${query.toLowerCase()} `;
	const out = new Set<string>();
	const targetLocale = opts.locale ?? null;
	const targetIndex = opts.index ?? null;
	for (const row of synonyms) {
		// Index filter
		if (targetIndex && row.indexes && row.indexes.length > 0) {
			if (!row.indexes.includes(targetIndex)) continue;
		}
		// Locale filter
		if (targetLocale && row.locale !== "*" && row.locale !== targetLocale) {
			continue;
		}
		const terms = row.terms.map((t) => t.toLowerCase());
		const reps = row.replacements.map((r) => r.toLowerCase());
		const queryHasTerm = terms.some((t) => lcQuery.includes(` ${t} `) || lcQuery.includes(t));
		if (queryHasTerm) {
			for (const r of reps) out.add(r);
		}
		if (!row.is_one_way) {
			const queryHasRep = reps.some((r) => lcQuery.includes(` ${r} `) || lcQuery.includes(r));
			if (queryHasRep) {
				for (const t of terms) out.add(t);
			}
		}
	}
	// Don't echo terms already in the query
	const inQuery = new Set(
		lcQuery
			.split(/\s+/)
			.map((s) => s.trim())
			.filter(Boolean),
	);
	return Array.from(out).filter((t) => !inQuery.has(t));
}
