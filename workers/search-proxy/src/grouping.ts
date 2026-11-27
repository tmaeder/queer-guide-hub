/**
 * Grouped search overview: one section per content type.
 *
 * The overview shows the top few hits of each type, so the types no longer
 * compete in one ranking. Each type is searched on its own, which makes the
 * per-section ranking identical to what that type's scoped "See all" list
 * returns. Scores from separate calls are not comparable (every call ranks its
 * own winner first), so section ORDER comes from the mixed ranking instead:
 * a type leads when its first hit sits highest in the all-types results.
 */

/**
 * The types the overview can show. Each is a scope chip on /search
 * (`SCOPE_ORDER` in src/components/search/SearchScopeChips.tsx), so every
 * section has a "See all" target. Postgres entity types.
 */
export const GROUP_TYPES = [
	"venue",
	"event",
	"marketplace",
	"news",
	"personality",
	"city",
	"queer_village",
	"tag",
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
 * Drop empty groups and order the rest by where each type's first hit falls in
 * the mixed ranking. Types absent from the mixed results follow, largest first,
 * then in GROUP_TYPES order so the result is stable.
 */
export function orderGroups<T>(
	mixed: ReadonlyArray<Record<string, unknown>>,
	groups: ReadonlyArray<SearchGroup<T>>,
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
			if (b.total !== a.total) return b.total - a.total;
			return typeRank(a.type) - typeRank(b.type);
		});
}
