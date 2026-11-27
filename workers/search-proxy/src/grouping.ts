/**
 * Grouped search overview: one section per content type.
 *
 * The overview shows the top few hits of each type, so the types no longer
 * compete in one ranking. Each type is searched on its own, which makes the
 * per-section ranking identical to what that type's scoped "See all" list
 * returns. Scores from separate calls are not comparable (every call ranks its
 * own winner first), so section ORDER comes from the mixed ranking instead:
 * a type leads when its first hit sits highest in the all-types results.
 *
 * The mixed call is allowed to fail (a cold broad query can run close to the
 * RPC timeout), and then no type has a mixed position. Ordering by total alone
 * would lead "berlin" with Venues, its biggest section, so a section whose
 * first hit IS the query (a city first, then any other type) leads instead.
 * The per-type hits are already in hand, so this costs no extra request.
 */

/**
 * The types the overview can show. Each is a scope chip on /search
 * (`SCOPE_ORDER` in src/components/search/SearchScopeChips.tsx), so every
 * section has a "See all" target. Postgres entity types.
 */
import {
	matchesQueryExactly,
	titleContainsPhrase,
	titleNamesPhrase,
	titleWordsEqual,
	type RankableHit,
} from "./rank";

export const GROUP_TYPES = [
	"venue",
	"event",
	"marketplace",
	"news",
	"personality",
	"city",
	"queer_village",
	"tag",
	// The Knowledge section (history, rights by country) plus organizations and
	// guides. All four are indexed and were reachable from the flat list, so
	// leaving them out of the overview hid them from the All tab entirely
	// ("marriage equality": 15 milestones in the flat top 20, none in the
	// overview). Each is a small type: measured on prod 2026-11-27, every one
	// answers in 150-200 ms, under venue and news, so the parallel fan-out
	// does not get slower for them.
	"milestone",
	"country",
	"organization",
	"guide",
] as const;

export const DEFAULT_PER_TYPE = 4;
export const MAX_PER_TYPE = 8;

export interface SearchGroup<T> {
	type: string;
	/** Exact count for the type: search_hybrid's own `total` for that call. */
	total: number;
	hits: T[];
}

/**
 * How strongly a section's first hit names the query: 2 for a city called
 * exactly the query, 1 for any other exact title or alias, 0 otherwise. Group
 * hits have been through prioritizeQueryMatches, so an exact title, if the
 * section has one, is already first.
 */
function exactTier<T>(group: SearchGroup<T>, query: string): number {
	const first = group.hits[0] as RankableHit | undefined;
	if (!first || !matchesQueryExactly(first, query)) return 0;
	return group.type === "city" ? 2 : 1;
}

/**
 * Drop empty groups and order the rest by where each type's first hit falls in
 * the mixed ranking. Types absent from the mixed results follow: first those
 * whose first hit is the query itself (see exactTier), then largest first, then
 * in GROUP_TYPES order so the result is stable. When the mixed call failed,
 * every type is absent and that tail is the whole order.
 */
export function orderGroups<T>(
	mixed: ReadonlyArray<Record<string, unknown>>,
	groups: ReadonlyArray<SearchGroup<T>>,
	query = "",
): SearchGroup<T>[] {
	const firstSeen = new Map<string, number>();
	mixed.forEach((hit, i) => {
		const t = typeof hit.type === "string" ? hit.type : null;
		if (t && !firstSeen.has(t)) firstSeen.set(t, i);
	});
	const typeRank = (t: string) => {
		const i = (GROUP_TYPES as readonly string[]).indexOf(t);
		return i < 0 ? GROUP_TYPES.length : i;
	};
	const ordered = groups
		.filter((g) => g.hits.length > 0)
		.slice()
		.sort((a, b) => {
			const fa = firstSeen.get(a.type);
			const fb = firstSeen.get(b.type);
			if (fa !== undefined && fb !== undefined) return fa - fb;
			if (fa !== undefined) return -1;
			if (fb !== undefined) return 1;
			const ea = exactTier(a, query);
			const eb = exactTier(b, query);
			if (ea !== eb) return eb - ea;
			if (b.total !== a.total) return b.total - a.total;
			return typeRank(a.type) - typeRank(b.type);
		});
	return historyLeads(ordered, query) ? leadWith(ordered, "milestone") : ordered;
}

/** Share of all results a history section must hold to lead (see historyLeads). */
export const HISTORY_LEAD_SHARE = 0.1;
/** For a news-heavy query: share of the non-news results History must hold. */
export const HISTORY_LEAD_SHARE_WITHOUT_NEWS = 0.12;
/** For a news-heavy query: History must be this specific (at most this many results). */
export const HISTORY_LEAD_MAX_TOTAL = 100;

/** Types that keep the lead when their first hit is named by the query. */
const NAMED_LEAD_TYPES = new Set(["city", "country", "personality"]);

/**
 * A history query leads with History, whatever the mixed ranking says. The
 * mixed ranking alone is not enough: for "marriage equality" its first hit is
 * an organization, and how many milestones reach its top 20 moved from 15 to 0
 * between two calls a few minutes apart. Totals are exact per type, so the rule
 * reads those. Measured on 233 real queries (2026-11-27), History leads when:
 *
 * - the History section's first hit contains the whole query ("Mattachine
 *   Society formed as an early gay rights group" for "mattachine"); and
 * - history is at least HISTORY_LEAD_SHARE of all results. Real history
 *   queries sit at 0.12-0.40 (lavender scare, gay liberation front, same-sex
 *   marriage, marriage equality); generic words that also appear in some
 *   milestone title sit at 0.08 and below (rights, transgender, sauna, bar).
 *   A news-heavy history query passes newsHeavyHistory instead; and
 * - no city, country or person is named exactly by the query. "zurich",
 *   "germany" and "harvey milk" pass both tests above, and the place or the
 *   person is still the better lead there.
 */
export function historyLeads<T>(groups: ReadonlyArray<SearchGroup<T>>, query: string): boolean {
	const history = groups.find((g) => g.type === "milestone");
	const first = history?.hits[0] as RankableHit | undefined;
	if (!history || !first || !titleContainsPhrase(first, query)) return false;
	const all = groups.reduce((sum, g) => sum + g.total, 0);
	if (all <= 0) return false;
	if (history.total / all < HISTORY_LEAD_SHARE && !newsHeavyHistory(groups, history, all, query)) {
		return false;
	}
	return !groups.some((g) => {
		if (!NAMED_LEAD_TYPES.has(g.type)) return false;
		const top = g.hits[0] as RankableHit | undefined;
		return !!top && (matchesQueryExactly(top, query) || titleWordsEqual(top, query));
	});
}

/**
 * A history query whose results are mostly news: "section 377" (48 news, 4
 * history), "act up", "aids crisis", "stonewall". News coverage of a historical
 * subject pushes History under HISTORY_LEAD_SHARE, so here History is judged
 * against the other, non-news results instead. Leaving news out alone would let
 * broad topics through ("rights": History is 47% of its non-news results), so it
 * also has to be specific and named:
 *
 * - news is the largest section;
 * - History holds at least HISTORY_LEAD_SHARE_WITHOUT_NEWS of the non-news
 *   results (act up 0.14; "gras" sits at 0.10);
 * - History has at most HISTORY_LEAD_MAX_TOTAL results ("transgender" 307,
 *   "rights" 904); and
 * - one of its hits names the query as a proper noun (titleNamesPhrase). That
 *   separates "Repeal of Don't Ask, Don't Tell" from "The Beaumont Society forms
 *   as a trans support group", and "trans rights" from "Section 377".
 */
function newsHeavyHistory<T>(
	groups: ReadonlyArray<SearchGroup<T>>,
	history: SearchGroup<T>,
	all: number,
	query: string,
): boolean {
	const largest = groups.reduce((a, b) => (b.total > a.total ? b : a));
	if (largest.type !== "news") return false;
	const withoutNews = all - largest.total;
	if (withoutNews <= 0 || history.total / withoutNews < HISTORY_LEAD_SHARE_WITHOUT_NEWS) return false;
	if (history.total > HISTORY_LEAD_MAX_TOTAL) return false;
	return history.hits.some((h) => titleNamesPhrase(h as RankableHit, query));
}

function leadWith<T>(groups: SearchGroup<T>[], type: string): SearchGroup<T>[] {
	const i = groups.findIndex((g) => g.type === type);
	return i <= 0 ? groups : [groups[i], ...groups.slice(0, i), ...groups.slice(i + 1)];
}

/**
 * The searchable types in the order their first hit appears in the mixed
 * ranking. Returned with the grouped response so a client that re-fetches a
 * section the worker could not load (a per-type call that timed out) can put
 * it back in its place instead of at the end: the mixed call ranks every type,
 * including the ones whose own call failed.
 */
export function mixedTypeOrder(mixed: ReadonlyArray<Record<string, unknown>>): string[] {
	const out: string[] = [];
	for (const hit of mixed) {
		const t = typeof hit.type === "string" ? hit.type : null;
		if (t && !out.includes(t) && (GROUP_TYPES as readonly string[]).includes(t)) out.push(t);
	}
	return out;
}
