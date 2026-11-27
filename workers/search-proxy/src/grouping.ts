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
import { matchesQueryExactly, type RankableHit } from "./rank";

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
	return groups
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
