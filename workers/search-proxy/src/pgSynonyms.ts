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
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("synonyms-timeout"), 3000);
	try {
		const res = await fetch(
			`${env.SUPABASE_URL}/rest/v1/search_synonyms?select=terms,replacements,is_one_way,indexes,locale&status=eq.active`,
			{
				headers: {
					apikey: env.SUPABASE_SERVICE_KEY,
					authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
				},
				signal: controller.signal,
			},
		);
		if (res.ok) {
			rows = (await res.json()) as PgSynonym[];
		} else {
			console.warn("loadActiveSynonyms: supabase", res.status, await res.text());
		}
	} catch (e) {
		console.warn("loadActiveSynonyms: fetch failed", (e as Error).message);
	} finally {
		clearTimeout(timer);
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
 * match a WORD of the query (case-insensitive) — see `matchesTerm`. Filters by
 * index and optional locale: a synonym row applies when its `indexes` is empty
 * (all) or includes the target index, AND its `locale` is '*' or matches.
 *
 * `indexes` IS CURRENTLY INERT AND THAT IS NOT OBVIOUS FROM HERE. The only
 * caller (`index.ts`) passes `{ locale }` and no `index`, so `targetIndex` is
 * null and the index filter is skipped for every row — a row scoped to
 * `['marketplace']` still fires on a venue query. Scoping it would also not be
 * the safety control it looks like: the caller's `requestedIndexes` defaults to
 * ALL_INDEXES, so an un-narrowed search intersects every scope anyway. Treat
 * `indexes` as advisory metadata until a caller opts in deliberately.
 *
 * Returns the deduped list of terms to append. Caller decides how to splice
 * them into the search query string.
 *
 * Bidirectional rows (is_one_way=false) match either direction: query word
 * in terms triggers append of replacements; query word in replacements
 * triggers append of terms.
 *
 * Caps the output at `maxTerms` (default 40). Even with word matching, a short
 * query can fire many synonyms once a large active set is enabled; the cap keeps
 * the embedded query from ballooning and bounds relevance dilution regardless of
 * how many synonyms are activated.
 */
const DEFAULT_MAX_EXPANSION_TERMS = 40;

/** A term short enough that matching it inside a longer word is noise, not a compound. */
const COMPOUND_MIN_LENGTH = 6;

/**
 * Does `lcQuery` (already space-padded) contain `term` as a word?
 *
 * THE OLD TEST WAS `lcQuery.includes(` ${t} `) || lcQuery.includes(t)`, and the
 * second clause subsumed the first — it made the whole thing a BARE SUBSTRING
 * match. The space padding on `lcQuery` only exists so the first clause can
 * check word boundaries, so the fallback defeated the design rather than
 * extending it.
 *
 * MEASURED ON PRODUCTION, via the search endpoint's own `debug.embedText`
 * (which echoes the expanded embedding query) against rows that are
 * `status='active'`, i.e. these were served to real traffic:
 *
 *   "ticket office hours"  -> "ketamine"               (ket inside tiCKETt)
 *   "barber shop berlin"   -> "kneipe pub"             (bar inside BARber)
 *   "doing laundry today"  -> "dom / doi / dob / doc"  (doi inside DOIng)
 *   "nepal travel guide"   -> "nep / neh"              (nep inside NEPal)
 *
 * Someone searching for a TICKET got ketamine folded into their embedding, and
 * someone searching for NEPAL got needle exchange.
 *
 * A second set — rack <- "bracket racing", doc <- "doctor appointment",
 * arts <- "parts for my bike", scat <- "scattered showers", upper <- "supper
 * club", crack <- "cracker barrel", slam <- "islam and lgbtq rights" — is
 * PROSPECTIVE rather than live: all of those rows sit in `approved`, so they
 * could not fire yet. They matter because the companion migration activates
 * them, which is why this fix has to land first. An earlier draft of this
 * comment called that set "live"; it was not, and querying which terms are
 * actually ACTIVE is what separated the two.
 *
 * A STRICT BOUNDARY ALONE IS ALSO WRONG, which is why this is not a one-line
 * deletion. German compounds are a real part of this corpus, and the strict
 * test breaks them: "lachgaskapseln" stops matching `lachgas`,
 * "mischkonsumrisiken" stops matching `mischkonsum`. Measured: 3 of 4 German
 * compound cases regress under a strict boundary.
 *
 * So a term may also match as a WORD PREFIX, but only when it is long enough
 * that doing so means compounding rather than coincidence. At 6+ characters
 * every hazard above is excluded (the longest is `crack`, 5) while every German
 * compound is kept (the shortest stem is `lachgas`, 7). The threshold sits in
 * that gap; it is not a round number chosen by eye.
 */
export function matchesTerm(lcQuery: string, term: string): boolean {
	if (!term) return false;
	if (lcQuery.includes(` ${term} `)) return true;
	return term.length >= COMPOUND_MIN_LENGTH && lcQuery.includes(` ${term}`);
}

export function expandWithPgSynonyms(
	query: string,
	synonyms: PgSynonym[],
	opts: { index?: string; locale?: string; maxTerms?: number } = {},
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
		const queryHasTerm = terms.some((t) => matchesTerm(lcQuery, t));
		if (queryHasTerm) {
			for (const r of reps) out.add(r);
		}
		if (!row.is_one_way) {
			const queryHasRep = reps.some((r) => matchesTerm(lcQuery, r));
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
	const maxTerms = opts.maxTerms ?? DEFAULT_MAX_EXPANSION_TERMS;
	return Array.from(out)
		.filter((t) => !inQuery.has(t))
		.slice(0, maxTerms);
}
