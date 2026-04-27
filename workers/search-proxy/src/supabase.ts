/**
 * Supabase REST + RPC client (edge-friendly).
 */

import type { Env } from "./index";

async function rpc<T = any>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
		method: "POST",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(args),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`supabase rpc ${fn} ${res.status}: ${text}`);
	}
	return (await res.json()) as T;
}

function parsePgVector(raw: any): number[] {
	if (Array.isArray(raw)) return raw;
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
	const rows = await rpc<any[]>(env, "get_bias_signal", {
		p_user_id: who.user_id ?? null,
		p_session_id: who.session_id ?? null,
		p_window: 30,
	});
	if (!rows?.length) return null;
	return rows.map((r) => ({
		embedding: parsePgVector(r.embedding),
		event_type: r.event_type,
		age_days: Number(r.age_days) || 0,
	}));
}

export async function getUserSignal(env: Env, who: { user_id?: string; session_id?: string }) {
	if (!who.user_id && !who.session_id) return null;
	try {
		return await rpc(env, "get_user_signal", {
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
): Promise<Array<{ content_type: string; content_id: string; score: number; metadata: any }>> {
	const pg = formatVec(opts.queryVec);
	return await rpc(env, "personalized_semantic_search", {
		p_query_vec: pg,
		p_bias_vec: null, // bias already blended in worker
		p_bias_weight: 0,
		p_content_types: opts.contentTypes ?? null,
		p_limit: opts.limit ?? 100,
	});
}

export async function popularEntities(env: Env, contentTypes: string[], limit = 30) {
	const types = contentTypes.map((t) => `"${t}"`).join(",");
	const url = `${env.SUPABASE_URL}/rest/v1/v_popular_entities?content_type=in.(${encodeURIComponent(types)})&order=score.desc&limit=${limit}`;
	const res = await fetch(url, {
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
		},
	});
	if (!res.ok) return [];
	return (await res.json()) as Array<{ content_type: string; content_id: string; score: number }>;
}

function formatVec(v: number[]): string {
	return `[${v.join(",")}]`;
}
