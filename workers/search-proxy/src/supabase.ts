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

/**
 * "More like this" — embedding neighbours via the related_entities RPC over the
 * unified search_documents table (liveness-filtered, seed excluded server-side).
 * Returns ready-to-render card objects. Fail-soft: [] on error.
 */
export async function relatedEntities(
	env: Env,
	opts: { entityType: string; entityId: string; contentTypes?: string[] | null; sameTypeOnly?: boolean; limit?: number; includeGated?: boolean },
): Promise<Array<Record<string, unknown>>> {
	try {
		return await rpc<Array<Record<string, unknown>>>(env, "related_entities", {
			p_entity_type: opts.entityType,
			p_entity_id: opts.entityId,
			p_content_types: opts.contentTypes && opts.contentTypes.length ? opts.contentTypes : null,
			p_same_type_only: opts.sameTypeOnly ?? false,
			p_limit: opts.limit ?? 10,
			p_include_gated: opts.includeGated ?? false,
		});
	} catch (e) {
		console.warn("related_entities", (e as Error).message);
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
		includeGated?: boolean;
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
			p_include_gated: opts.includeGated ?? false,
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
