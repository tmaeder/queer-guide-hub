/**
 * Postgres search backend (Phase 2 of the Meili -> Postgres migration).
 *
 * Calls the `search_hybrid` + `search_facets` RPCs (see
 * supabase/migrations/20260531155744_search_hybrid_and_facets_rpcs.sql) via the
 * existing PostgREST path. `search_hybrid` already fuses keyword (FTS+trigram)
 * and vector (pgvector) legs with RRF *in SQL* and applies trust/liveness/
 * geo/imminence boosts — so on the PG path it replaces BOTH the Meili call and
 * the `personalized_semantic_search` call. The Worker still layers
 * `personalizedRank` + the optional reranker on top.
 *
 * The Worker passes an already-blended query vector (query ⊕ bias), matching
 * today's architecture where the bias blend is computed Worker-side.
 *
 * Gated behind env.SEARCH_BACKEND ("meili" | "pg" | "shadow"); default "meili"
 * means this module is dormant until explicitly enabled.
 */

import type { Env } from "./index";

const RPC_TIMEOUT_MS = 4000;

export interface PgSearchArgs {
	query: string;
	queryVec?: number[] | null;
	/** Postgres entity types, e.g. ["venue","event"]. null = all indexed types. */
	contentTypes?: string[] | null;
	filters?: {
		city?: string;
		country?: string;
		category?: string;
		is_featured?: boolean;
		is_free?: boolean;
		target_groups?: string[];
		tags?: string[];
	};
	lat?: number | null;
	lng?: number | null;
	radiusKm?: number | null;
	/** Date window (ISO 8601) — narrows dated entities (events/news). */
	dateFrom?: string | null;
	dateTo?: string | null;
	/** Price window — narrows priced entities (marketplace/events). */
	priceMin?: number | null;
	priceMax?: number | null;
	/** Server-side sort mode (p_sort); undefined/relevance = score order. */
	sort?: string | null;
	/**
	 * When true, include safety-gated (high-risk-country) entities in the results.
	 * Set only after the Worker has verified the caller's Supabase JWT. Passed to
	 * the RPCs as p_filters.include_gated; default/false keeps gated content hidden.
	 */
	includeGated?: boolean;
	hitsPerPage: number;
	page: number;
}

export interface PgSearchResult {
	hits: Array<Record<string, unknown>>;
	facetDistribution: Record<string, Record<string, number>>;
	estimatedTotalHits: number;
	tookMs: number;
}

function vecLiteral(v?: number[] | null): string | null {
	return v && v.length ? `[${v.join(",")}]` : null;
}

async function callRpc<T>(env: Env, fn: string, args: Record<string, unknown>, timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("pg-rpc-timeout"), timeoutMs);
	try {
		const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
			method: "POST",
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(args),
			signal: controller.signal,
		});
		if (!res.ok) throw new Error(`pg rpc ${fn} ${res.status}: ${await res.text()}`);
		return (await res.json()) as T;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Maps a `search_hybrid` JSON hit into the same shape the Worker's Meili
 * mapHit() emits, so the downstream fuse/rank/response code is backend-agnostic.
 * Notably sets `_fused` = the SQL ranking score (personalizedRank adds boosts on
 * top of `_fused`).
 */
function mapHit(h: Record<string, unknown>): Record<string, unknown> {
	const geo = h._geoloc as { lat: number; lng: number } | null | undefined;
	const score = typeof h._rankingScore === "number" ? h._rankingScore : 0;
	return {
		id: h.objectID as string | undefined,
		objectID: h.objectID as string | undefined,
		type: h.type as string | undefined,
		content_type: h.type as string | undefined,
		title: h.title as string | undefined,
		name: h.title as string | undefined,
		description: h.description as string | undefined,
		category: h.category as string | undefined,
		city: h.city as string | undefined,
		country: h.country as string | undefined,
		_geoloc: geo ? { lat: geo.lat, lng: geo.lng } : undefined,
		image_url: (h.imageUrl as string) ?? null,
		optimized_url: (h.optimizedUrl as string) ?? null,
		thumbnail_url: (h.thumbnailUrl as string) ?? null,
		slug: h.slug as string | undefined,
		start_date: h.start_date as number | string | undefined,
		end_date: h.end_date as number | string | undefined,
		is_free: h.is_free as boolean | undefined,
		price_min: h.price_min as number | undefined,
		price_max: h.price_max as number | undefined,
		featured: Boolean(h.featured),
		tags: Array.isArray(h.tags) ? (h.tags as string[]) : [],
		trust_score: h.trust_score as number | undefined,
		liveness_status: h.liveness_status as string | undefined,
		_distance_m: h._distance_m as number | undefined,
		_rankingScore: score,
		_fused: score,
		_source: "pg",
	};
}

export async function pgHybridSearch(env: Env, args: PgSearchArgs, timeoutMs = RPC_TIMEOUT_MS): Promise<PgSearchResult> {
	const started = Date.now();
	const pFilters: Record<string, unknown> = {};
	if (args.filters?.city) pFilters.city = args.filters.city;
	if (args.filters?.country) pFilters.country = args.filters.country;
	if (args.filters?.category) pFilters.category = args.filters.category;
	if (typeof args.filters?.is_featured === "boolean") pFilters.is_featured = args.filters.is_featured;
	if (typeof args.filters?.is_free === "boolean") pFilters.is_free = args.filters.is_free;
	if (args.filters?.target_groups && args.filters.target_groups.length) pFilters.target_groups = args.filters.target_groups;
	if (args.filters?.tags && args.filters.tags.length) pFilters.tags = args.filters.tags;
	// Safety layer: only verified-authenticated callers see gated content. The
	// same pFilters object is passed to both search_hybrid and search_facets.
	if (args.includeGated) pFilters.include_gated = true;

	const pContentTypes = args.contentTypes && args.contentTypes.length ? args.contentTypes : null;
	const offset = Math.max(0, args.page) * args.hitsPerPage;

	const hybridArgs = {
		p_query: args.query,
		p_query_vec: vecLiteral(args.queryVec),
		p_content_types: pContentTypes,
		p_filters: pFilters,
		p_lat: args.lat ?? null,
		p_lng: args.lng ?? null,
		p_radius_km: args.radiusKm ?? null,
		p_limit: args.hitsPerPage,
		p_offset: offset,
		p_date_from: args.dateFrom ?? null,
		p_date_to: args.dateTo ?? null,
		p_price_min: args.priceMin ?? null,
		p_price_max: args.priceMax ?? null,
		p_sort: args.sort && args.sort !== "relevance" ? args.sort : null,
	};
	const facetArgs = {
		p_query: args.query,
		p_content_types: pContentTypes,
		p_filters: pFilters,
		p_lat: args.lat ?? null,
		p_lng: args.lng ?? null,
		p_radius_km: args.radiusKm ?? null,
	};

	const [hybrid, facets] = await Promise.all([
		callRpc<{ total?: number; hits?: Array<Record<string, unknown>> }>(env, "search_hybrid", hybridArgs, timeoutMs),
		callRpc<Record<string, Record<string, number>>>(env, "search_facets", facetArgs, timeoutMs).catch(() => ({})),
	]);

	const hits = (hybrid?.hits ?? []).map(mapHit);
	return {
		hits,
		facetDistribution: facets ?? {},
		estimatedTotalHits: hybrid?.total ?? hits.length,
		tookMs: Date.now() - started,
	};
}

/** A typeahead suggestion in the same shape the Worker's /autocomplete emits. */
export interface PgSuggestion {
	id?: string;
	type?: string;
	title?: string;
	/** No Meili highlight payload on the PG path; the client falls back to its
	 *  own substring highlight when this is null. */
	title_formatted: string | null;
	city?: string;
	country?: string;
	slug?: string;
	image_url?: string | null;
	optimized_url?: string | null;
	thumbnail_url?: string | null;
}

/**
 * Postgres-native autocomplete via the `search_autocomplete` RPC (prefix-first
 * with a trigram fuzzy fallback for typo tolerance; filters dead/cancelled/
 * closed entities and past events). Replaces the Meili multi-search on the PG
 * backend. `contentTypes` are Postgres entity types (e.g. ["venue","event"]);
 * null searches all indexed types.
 */
export async function pgAutocomplete(
	env: Env,
	prefix: string,
	contentTypes: string[] | null,
	limit: number,
	includeGated = false,
): Promise<PgSuggestion[]> {
	const rows = await callRpc<Array<Record<string, unknown>>>(env, "search_autocomplete", {
		p_prefix: prefix,
		p_content_types: contentTypes && contentTypes.length ? contentTypes : null,
		p_limit: limit,
		p_include_gated: includeGated,
	});
	return (rows ?? []).map((r) => ({
		id: r.objectID as string | undefined,
		type: r.type as string | undefined,
		title: r.title as string | undefined,
		title_formatted: null,
		city: r.city as string | undefined,
		country: r.country as string | undefined,
		slug: r.slug as string | undefined,
		image_url: (r.imageUrl as string) ?? null,
		optimized_url: (r.optimizedUrl as string) ?? null,
		thumbnail_url: (r.thumbnailUrl as string) ?? null,
	}));
}
