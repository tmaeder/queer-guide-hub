/**
 * Supabase REST + RPC client (edge-friendly).
 */

import type { Env } from "./index";

// Hard timeout per Supabase RPC. The worker has ~30s of CPU time total, and
// a single request can hit 4-5 RPCs in parallel; if even one of them stalls
// the whole search hangs. 4s is enough for normal latencies (p95 < 1s) and
// short enough that a degraded backend doesn't take down search entirely.
const RPC_TIMEOUT_MS = 4000;

async function rpc<T = unknown>(env: Env, fn: string, args: Record<string, unknown>, opts: { timeoutMs?: number } = {}): Promise<T> {
	const controller = new AbortController();
	const timeoutMs = opts.timeoutMs ?? RPC_TIMEOUT_MS;
	const timer = setTimeout(() => controller.abort("rpc-timeout"), timeoutMs);
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
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`supabase rpc ${fn} ${res.status}: ${text}`);
		}
		return (await res.json()) as T;
	} finally {
		clearTimeout(timer);
	}
}

function parsePgVector(raw: unknown): number[] {
	if (Array.isArray(raw)) return raw.map(Number);
	if (typeof raw === "string") {
		// "[0.1,0.2,...]"
		return raw.replace(/^\[|\]$/g, "").split(",").map(Number);
	}
	return [];
}

export async function getBiasVector(
	env: Env,
	who: { user_id?: string; session_id?: string },
): Promise<{ embedding: number[]; event_type: string; age_days: number }[] | null> {
	if (!who.user_id && !who.session_id) return null;
	try {
		const rows = await rpc<Array<{ embedding: unknown; event_type: string; age_days: number | string }>>(
			env,
			"get_bias_signal",
			{
				p_user_id: who.user_id ?? null,
				p_session_id: who.session_id ?? null,
				p_window: 30,
			},
		);
		if (!rows?.length) return null;
		return rows.map((r) => ({
			embedding: parsePgVector(r.embedding),
			event_type: r.event_type,
			age_days: Number(r.age_days) || 0,
		}));
	} catch (e) {
		console.warn("get_bias_signal", (e as Error).message);
		return null;
	}
}

export interface UserSignal {
	interests?: string[];
	languages?: string[];
	home_city?: string | null;
	recent_cities?: string[];
	recent_tags?: string[];
}

export async function getUserSignal(
	env: Env,
	who: { user_id?: string; session_id?: string },
): Promise<UserSignal | null> {
	if (!who.user_id && !who.session_id) return null;
	try {
		return await rpc<UserSignal>(env, "get_user_signal", {
			p_user_id: who.user_id ?? null,
			p_session_id: who.session_id ?? null,
		});
	} catch (e) {
		console.warn("get_user_signal", e);
		return null;
	}
}

export async function trackEvent(
	env: Env,
	body: {
		user_id?: string;
		session_id?: string;
		event_type: string;
		entity_type: string;
		entity_id: string;
		metadata?: Record<string, unknown>;
	},
): Promise<string> {
	return (await rpc(env, "track_user_event", {
		p_user_id: body.user_id ?? null,
		p_session_id: body.session_id ?? null,
		p_event_type: body.event_type,
		p_entity_type: body.entity_type,
		p_entity_id: body.entity_id,
		p_metadata: body.metadata ?? {},
	})) as string;
}

export async function semanticSearch(
	env: Env,
	opts: { queryVec: number[]; contentTypes?: string[] | null; biasWeight?: number; limit?: number },
): Promise<Array<{ content_type: string; content_id: string; score: number; metadata: Record<string, unknown> }>> {
	const pg = formatVec(opts.queryVec);
	try {
		return await rpc<Array<{ content_type: string; content_id: string; score: number; metadata: Record<string, unknown> }>>(
			env,
			"personalized_semantic_search",
			{
				p_query_vec: pg,
				p_bias_vec: null,
				p_bias_weight: 0,
				p_content_types: opts.contentTypes ?? null,
				p_limit: opts.limit ?? 100,
			},
		);
	} catch (e) {
		// Fail-soft: empty semantic hits → /search degrades to Meilisearch-only
		// instead of timing out. Bug observed 2026-05-03 when the RPC stalled
		// indefinitely after a large data update.
		console.warn("personalized_semantic_search", (e as Error).message);
		return [];
	}
}

/**
 * Personalized, popularity-aware discovery feed (get_recommendations RPC).
 * Powers the zero-query search panel. The bias vector (if any) is computed
 * Worker-side from tracked engagement, matching the /search blend convention.
 * Fail-soft: returns [] on error so the panel degrades to empty rather than 500.
 */
export async function getRecommendations(
	env: Env,
	opts: {
		biasVec?: number[] | null;
		contentTypes?: string[] | null;
		city?: string | null;
		lat?: number | null;
		lng?: number | null;
		radiusKm?: number | null;
		excludeIds?: string[] | null;
		limit?: number;
	},
): Promise<Array<Record<string, unknown>>> {
	try {
		return await rpc<Array<Record<string, unknown>>>(env, "get_recommendations", {
			p_bias_vec: opts.biasVec && opts.biasVec.length ? `[${opts.biasVec.join(",")}]` : null,
			p_content_types: opts.contentTypes && opts.contentTypes.length ? opts.contentTypes : null,
			p_city: opts.city ?? null,
			p_lat: opts.lat ?? null,
			p_lng: opts.lng ?? null,
			p_radius_km: opts.radiusKm ?? null,
			p_exclude_ids: opts.excludeIds && opts.excludeIds.length ? opts.excludeIds : null,
			p_limit: opts.limit ?? 20,
		});
	} catch (e) {
		console.warn("get_recommendations", (e as Error).message);
		return [];
	}
}

export async function popularEntities(env: Env, contentTypes: string[], limit = 30) {
	const types = contentTypes.map((t) => `"${t}"`).join(",");
	const url = `${env.SUPABASE_URL}/rest/v1/v_popular_entities?content_type=in.(${encodeURIComponent(types)})&order=score.desc&limit=${limit}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("popular-timeout"), RPC_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			},
			signal: controller.signal,
		});
		if (!res.ok) return [];
		return (await res.json()) as Array<{ content_type: string; content_id: string; score: number }>;
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

function formatVec(v: number[]): string {
	return `[${v.join(",")}]`;
}

// Per-content-type table + display-field spec for metadata enrichment.
// `content_embeddings.metadata` only carries the minimal fields the embedding
// pipeline wrote at index time (often just FK ids), so /similar and the
// pgvector half of /search came back with broken titles/images. We backfill by
// batching one PostgREST select per type and projecting display fields.
export interface DisplayRecord {
	title?: string;
	slug?: string;
	image_url?: string;
	city?: string;
	country?: string;
	date?: string;
}

const DISPLAY_SOURCES: Record<
	string,
	{ table: string; columns: string[]; map: (r: Record<string, unknown>) => DisplayRecord }
> = {
	venue: {
		table: "venues",
		columns: ["id", "name", "slug", "logo_url", "images", "city", "country"],
		map: (r) => ({
			title: firstStr(r.name) ?? undefined,
			slug: firstStr(r.slug) ?? undefined,
			image_url:
				firstStr((r.images as unknown[])?.[0]) ?? firstStr(r.logo_url) ?? undefined,
			city: firstStr(r.city) ?? undefined,
			country: firstStr(r.country) ?? undefined,
		}),
	},
	event: {
		table: "events",
		columns: ["id", "title", "slug", "logo_url", "images", "city", "country", "start_date"],
		map: (r) => ({
			title: firstStr(r.title) ?? undefined,
			slug: firstStr(r.slug) ?? undefined,
			image_url:
				firstStr((r.images as unknown[])?.[0]) ?? firstStr(r.logo_url) ?? undefined,
			city: firstStr(r.city) ?? undefined,
			country: firstStr(r.country) ?? undefined,
			date: firstStr(r.start_date) ?? undefined,
		}),
	},
	city: {
		// Embedded FK pulls the country name in one round-trip.
		table: "cities",
		columns: ["id", "name", "slug", "curated_image_url", "image_url", "countries(name)"],
		map: (r) => {
			const countries = r.countries as { name?: unknown } | null | undefined;
			return {
				title: firstStr(r.name) ?? undefined,
				slug: firstStr(r.slug) ?? undefined,
				image_url: firstStr(r.curated_image_url) ?? firstStr(r.image_url) ?? undefined,
				country: firstStr(countries?.name) ?? undefined,
			};
		},
	},
	country: {
		table: "countries",
		columns: ["id", "name", "slug", "curated_image_url", "image_url"],
		map: (r) => ({
			title: firstStr(r.name) ?? undefined,
			slug: firstStr(r.slug) ?? undefined,
			image_url: firstStr(r.curated_image_url) ?? firstStr(r.image_url) ?? undefined,
		}),
	},
	personality: {
		table: "personalities",
		columns: ["id", "name", "slug", "image_url"],
		map: (r) => ({
			title: firstStr(r.name) ?? undefined,
			slug: firstStr(r.slug) ?? undefined,
			image_url: firstStr(r.image_url) ?? undefined,
		}),
	},
	news: {
		table: "news_articles",
		columns: ["id", "title", "slug", "image_url"],
		map: (r) => ({
			title: firstStr(r.title) ?? undefined,
			slug: firstStr(r.slug) ?? undefined,
			image_url: firstStr(r.image_url) ?? undefined,
		}),
	},
	marketplace: {
		table: "marketplace_listings",
		columns: ["id", "title", "slug", "image_url"],
		map: (r) => ({
			title: firstStr(r.title) ?? undefined,
			slug: firstStr(r.slug) ?? undefined,
			image_url: firstStr(r.image_url) ?? undefined,
		}),
	},
};

function firstStr(v: unknown): string | null {
	return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Batch-fetch display fields (title, slug, image_url, city, country) for a set
 * of (content_type, content_id) hits. Returns Map keyed by `${type}:${id}`.
 * Fail-soft: any per-type error yields an empty contribution rather than
 * throwing.
 */
export async function fetchDisplayMap(
	env: Env,
	hits: Array<{ content_type: string; content_id: string }>,
): Promise<Map<string, DisplayRecord>> {
	const out = new Map<string, DisplayRecord>();
	if (!hits.length) return out;
	const byType = new Map<string, Set<string>>();
	for (const h of hits) {
		if (!h.content_id || !h.content_type) continue;
		const set = byType.get(h.content_type) ?? new Set<string>();
		set.add(h.content_id);
		byType.set(h.content_type, set);
	}
	await Promise.all(
		Array.from(byType.entries()).map(async ([type, ids]) => {
			const spec = DISPLAY_SOURCES[type];
			if (!spec) return;
			const idList = Array.from(ids);
			// PostgREST `in.(...)` accepts up to a few thousand uuids comfortably.
			const inList = idList.map((id) => `"${id}"`).join(",");
			const url =
				`${env.SUPABASE_URL}/rest/v1/${spec.table}` +
				`?id=in.(${encodeURIComponent(inList)})` +
				`&select=${spec.columns.join(",")}`;
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort("display-enrich-timeout"), RPC_TIMEOUT_MS);
			try {
				const res = await fetch(url, {
					headers: {
						apikey: env.SUPABASE_SERVICE_KEY,
						authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
					},
					signal: controller.signal,
				});
				if (!res.ok) return;
				const rows = (await res.json()) as Array<Record<string, unknown>>;
				for (const r of rows) {
					const id = String(r.id ?? "");
					if (!id) continue;
					out.set(`${type}:${id}`, spec.map(r));
				}
			} catch (e) {
				console.warn("fetchDisplayMap", type, (e as Error).message);
			} finally {
				clearTimeout(timer);
			}
		}),
	);
	return out;
}
