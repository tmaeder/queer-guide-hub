/**
 * Meilisearch multi-search client.
 */

import type { Env } from "./index";

export const INDEX_MAP: Record<string, string> = {
	venues: "venues",
	events: "events",
	users: "personalities",
	news: "news",
	marketplace: "marketplace",
	locations: "cities",
	cities: "cities",
	countries: "countries",
	content: "tags",
	tags: "tags",
	personalities: "personalities",
	queer_villages: "queer_villages",
};

export const ALL_INDEXES = [
	"venues",
	"events",
	"cities",
	"countries",
	"news",
	"marketplace",
	"personalities",
	"tags",
	"queer_villages",
];

export const INDEX_FACETS: Record<string, string[]> = {
	venues: ["type", "city", "country", "category", "featured"],
	events: ["type", "city", "country", "event_type", "featured"],
	cities: ["type", "country"],
	countries: ["type", "continent"],
	news: ["type", "category", "is_featured"],
	marketplace: ["type", "category", "featured"],
	personalities: ["type", "profession", "nationality"],
	tags: ["type", "category"],
	queer_villages: ["type", "city", "country", "featured"],
};

/** Drops AND-joined filter clauses that reference attributes not filterable on the given index. */
function scopeFilterToIndex(filter: string | undefined, indexUid: string): string | undefined {
	if (!filter) return undefined;
	const allowed = new Set([
		...(INDEX_FACETS[indexUid] || []),
		"_geo",
		"_geoRadius",
		"id",
		"type",
		"is_featured",
		"start_date",
		"end_date",
	]);
	// Conservative split on " AND " — we only emit AND-joined clauses from buildFilters().
	const parts = filter.split(/\s+AND\s+/i);
	const kept = parts.filter((p) => {
		const m = p.match(/[(]?([_a-zA-Z][\w]*)/);
		const attr = m?.[1];
		// _geoRadius() — keep if index has _geo.
		if (/_geoRadius/i.test(p)) return allowed.has("_geo");
		return !attr || allowed.has(attr);
	});
	return kept.length ? kept.join(" AND ") : undefined;
}

export interface SearchFilters {
	featured?: boolean;
	location?: string;
	city?: string;
	country?: string;
	categories?: string[];
	tags?: string[];
	types?: string[];
	lat?: number;
	lng?: number;
	radius?: number;
	date_from?: string | number | Date;
	date_to?: string | number | Date;
}

export function buildFilters(filters: SearchFilters | null | undefined): string | undefined {
	if (!filters) return undefined;
	const parts: string[] = [];
	if (filters.featured) parts.push("featured = true OR is_featured = true");
	if (filters.location) {
		const loc = esc(filters.location);
		parts.push(`(city = "${loc}" OR country = "${loc}")`);
	}
	if (filters.city) parts.push(`city = "${esc(filters.city)}"`);
	if (filters.country) parts.push(`country = "${esc(filters.country)}"`);
	if (filters.categories?.length) {
		const cats = filters.categories.map((c: string) => `category = "${esc(c)}"`).join(" OR ");
		parts.push(`(${cats})`);
	}
	if (filters.tags?.length) {
		const t = filters.tags.map((c: string) => `tags = "${esc(c)}"`).join(" OR ");
		parts.push(`(${t})`);
	}
	if (filters.lat != null && filters.lng != null && filters.radius) {
		parts.push(`_geoRadius(${filters.lat}, ${filters.lng}, ${filters.radius * 1000})`);
	}
	if (filters.date_from) parts.push(`start_date >= ${Math.floor(new Date(filters.date_from).getTime() / 1000)}`);
	if (filters.date_to) parts.push(`start_date <= ${Math.floor(new Date(filters.date_to).getTime() / 1000)}`);
	return parts.length ? parts.join(" AND ") : undefined;
}

function esc(s: string): string {
	return s.replace(/"/g, '\\"');
}

export async function meiliMultiSearch(
	env: Env,
	args: {
		indexes: string[];
		query: string;
		filter?: string;
		facets: Record<string, string[]>;
		hitsPerPage: number;
		useHybrid: boolean;
	},
) {
	const queries = args.indexes.map((indexUid) => ({
		indexUid,
		q: args.query,
		limit: Math.max(5, Math.ceil(args.hitsPerPage * 1.5)),
		// Strip filter clauses that reference attributes the index doesn't have as filterable.
		filter: scopeFilterToIndex(args.filter, indexUid),
		facets: args.facets[indexUid] || ["type"],
		attributesToHighlight: ["title", "description", "name"],
		showRankingScore: true,
		...(args.useHybrid ? { hybrid: { semanticRatio: 0.5, embedder: "default" } } : {}),
	}));

	type MeiliQuery = (typeof queries)[number];
	const run = async (q: Array<MeiliQuery | Omit<MeiliQuery, "hybrid">>) =>
		fetch(`${env.MEILISEARCH_URL}/multi-search`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.MEILISEARCH_SEARCH_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ queries: q }),
		});

	let res = await run(queries);
	if (!res.ok && args.useHybrid) {
		// Fallback: lexical only.
		const q2 = queries.map(({ hybrid: _hybrid, ...rest }) => rest);
		res = await run(q2);
	}
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`meili ${res.status}: ${text}`);
	}
	type MeiliResult = {
		indexUid: string;
		hits: Array<Record<string, unknown>>;
		estimatedTotalHits?: number;
		facetDistribution?: Record<string, Record<string, number>>;
	};
	const data = (await res.json()) as { results: MeiliResult[] };

	const hits: ReturnType<typeof mapHit>[] = [];
	const mergedFacets: Record<string, Record<string, number>> = {};
	let totalHits = 0;
	for (const r of data.results) {
		for (const h of r.hits) {
			hits.push(mapHit(h, r.indexUid));
		}
		totalHits += r.estimatedTotalHits || 0;
		if (r.facetDistribution) {
			for (const [k, vs] of Object.entries(r.facetDistribution as Record<string, Record<string, number>>)) {
				if (!mergedFacets[k]) mergedFacets[k] = {};
				for (const [v, c] of Object.entries(vs)) mergedFacets[k][v] = (mergedFacets[k][v] || 0) + c;
			}
		}
	}
	hits.sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0));

	return {
		hits,
		facetDistribution: mergedFacets,
		estimatedTotalHits: totalHits,
		seenRecently: new Set<string>(), // populated later if we wire recent views
	};
}

function mapHit(hit: Record<string, unknown>, indexUid: string) {
	const geo = hit._geo as { lat: number; lng: number } | undefined;
	return {
		id: hit.id as string | undefined,
		objectID: hit.id as string | undefined,
		type: (hit.type as string) || indexUid,
		content_type: indexTypeOf(indexUid),
		title: (hit.title as string) || (hit.name as string),
		name: (hit.title as string) || (hit.name as string),
		description: hit.description as string | undefined,
		category: (hit.category as string) || (hit.event_type as string) || (hit.profession as string),
		city: hit.city as string | undefined,
		country: hit.country as string | undefined,
		_geoloc: geo ? { lat: geo.lat, lng: geo.lng } : undefined,
		image_url: (hit.image_url as string) || (hit.logo_url as string),
		slug: hit.slug as string | undefined,
		start_date: hit.start_date as number | string | undefined,
		end_date: hit.end_date as number | string | undefined,
		featured: Boolean(hit.featured || hit.is_featured),
		tags: (hit.tags as string[]) || [],
		_rankingScore: (hit._rankingScore as number) || 0,
	};
}

function indexTypeOf(indexUid: string): string {
	return (
		{
			venues: "venue",
			events: "event",
			cities: "city",
			countries: "country",
			news: "news",
			marketplace: "marketplace",
			personalities: "personality",
			tags: "tag",
			queer_villages: "queer_village",
		}[indexUid] || indexUid
	);
}
