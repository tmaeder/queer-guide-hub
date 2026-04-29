/**
 * queer-guide-search-proxy v2
 * Personalized, multilingual hybrid search.
 *
 * Endpoints:
 *   POST /search      - hybrid search w/ personalization + rerank
 *   POST /track       - record user event (click/save/book/dismiss)
 *   POST /onboarding  - persist minimal prefs at signup
 *   POST /similar     - "more like this" via vector
 *   GET  /health
 */

import { personalizedRank } from "./rank";
import { embed, rerank, DEFAULT_EMBED_MODEL } from "./ai";
import { rewriteQuery } from "./rewrite";
import { Toucan } from "toucan-js";

function sentry(env: Env, request: Request, ctx: ExecutionContext): Toucan | null {
	if (!env.SENTRY_DSN) return null;
	return new Toucan({
		dsn: env.SENTRY_DSN,
		context: ctx,
		request,
		release: env.SENTRY_RELEASE,
		environment: env.SENTRY_ENV || "production",
		tracesSampleRate: 0.1,
	});
}
import { getBiasVector, getUserSignal, trackEvent, semanticSearch, popularEntities } from "./supabase";
import { loadActiveSynonyms, expandWithPgSynonyms } from "./pgSynonyms";
import { meiliMultiSearch, buildFilters, INDEX_MAP, INDEX_FACETS, ALL_INDEXES } from "./meili";
import { getCorsHeaders, json } from "./util";

export interface Env {
	AI: Ai;
	MEILISEARCH_URL: string;
	MEILISEARCH_SEARCH_KEY: string;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_KEY: string; // service role for RPC
	AI_GATEWAY_ACCOUNT_ID: string;
	AI_GATEWAY_NAME: string;
	ALLOWED_ORIGINS: string;
	EMBED_CACHE: KVNamespace;
	EMBED_MODEL?: string;
	ENABLE_RERANKER?: string; // "1" to enable
	SESSION_CACHE: KVNamespace; // per-session recent views for decay
	ADMIN_TOKEN?: string;
	SENTRY_DSN?: string;
	SENTRY_ENV?: string;
	SENTRY_RELEASE?: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const cors = getCorsHeaders(request, env);
		if (request.method === "OPTIONS") return new Response(null, { headers: cors });

		const url = new URL(request.url);

		// Rate limit: 60 rps per IP, sliding window in KV. /health bypasses.
		if (url.pathname !== "/health") {
			const rl = await rateLimit(env, request);
			if (!rl.ok) return json({ error: "rate_limited", retry_after: rl.retryAfter }, 429, { ...cors, "Retry-After": String(rl.retryAfter) });
		}

		try {
			switch (url.pathname) {
				case "/health":
					return json({ ok: true, ts: Date.now() }, 200, cors);
				case "/":           // backward compat: old client POSTs to /
				case "/search":
					return await handleSearch(request, env, ctx, cors);
				case "/autocomplete":
					return await handleAutocomplete(request, env, cors);
				case "/trending":
					return await handleTrending(request, env, cors);
				case "/track":
					return await handleTrack(request, env, cors);
				case "/onboarding":
					return await handleOnboarding(request, env, cors);
				case "/similar":
					return await handleSimilar(request, env, cors);
				case "/feedback":
					return await handleFeedback(request, env, cors);
				case "/admin/analytics":
					return await handleAnalytics(request, env, cors);
				default:
					return json({ error: "not found" }, 404, cors);
			}
		} catch (e: any) {
			console.error("handler error", e);
			try {
				sentry(env, request, ctx)?.captureException(e);
			} catch {
				/* sentry best-effort */
			}
			return json({ error: "internal", details: e?.message ?? String(e) }, 500, cors);
		}
	},
};

// ─────────────────────────────────────────────
// /search
// ─────────────────────────────────────────────
async function handleSearch(request: Request, env: Env, ctx: ExecutionContext, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method" }, 405, cors);
	const started = Date.now();
	const body = (await request.json()) as SearchBody;
	const { query, filters = {}, hitsPerPage = 20, user_id, session_id, lang = "en" } = body;

	if (!query?.trim()) {
		return json({ hits: [], facetDistribution: {}, processingTimeMS: 0 }, 200, cors);
	}

	const q = query.trim();

	// Query rewrite: translates non-EN, extracts intent hints (city, type), adds synonyms.
	// Enabled when lang != en OR query is short (< 3 words). Skipped for power queries.
	const shouldRewrite = lang !== "en" || q.split(/\s+/).length < 3;
	const rewrite = shouldRewrite ? await rewriteQuery(env, q, lang) : null;

	const effectiveQ = rewrite?.q_en || q;
	const mergedFilters = { ...filters };
	if (rewrite?.city && !mergedFilters.city && !mergedFilters.location) mergedFilters.city = rewrite.city;
	if (rewrite?.type_hint && !mergedFilters.types?.length) {
		const tMap: Record<string, string> = { venue: "venues", event: "events", city: "cities", personality: "personalities", news: "news" };
		mergedFilters.types = [tMap[rewrite.type_hint] || rewrite.type_hint];
	}

	const requestedIndexes: string[] = mergedFilters.types?.length
		? [...new Set<string>(mergedFilters.types.map((t: string) => INDEX_MAP[t] || t).filter((t: string) => ALL_INDEXES.includes(t)))]
		: ALL_INDEXES;

	const filterParts = buildFilters(mergedFilters);

	// Parallel: embed q + load personalization signal + seen-recently set.
	const embedModel = env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
	const sessionKey = user_id ? `u:${user_id}` : session_id ? `s:${session_id}` : null;

	// Postgres-backed synonyms (search_synonyms WHERE status='active'),
	// cached in Worker KV (5 min). Augments the LLM rewrite synonyms.
	// Fail-open on KV / Supabase errors — empty list is fine.
	const pgSyns = await loadActiveSynonyms(env);
	const pgExpansionTerms = expandWithPgSynonyms(effectiveQ, pgSyns, { locale: lang });
	const allSynonyms = Array.from(
		new Set<string>([...(rewrite?.synonyms ?? []), ...pgExpansionTerms]),
	);

	const embedText = allSynonyms.length ? `${effectiveQ} ${allSynonyms.join(" ")}` : effectiveQ;
	const [qVec, signal, recent] = await Promise.all([
		embed(env, embedText, { cacheKey: `q:${embedModel}:${lang}:${embedText}` }),
		loadSignal(env, { user_id, session_id }),
		sessionKey ? loadRecentSeen(env, sessionKey) : Promise.resolve(new Set<string>()),
	]);

	// Compose biased vector in JS (weighted mean over signal.biasItems, normalized).
	const biasVec = computeBias(signal.biasItems);
	const blendedVec = biasVec ? blendVectors(qVec, biasVec, 0.7) : qVec;

	// Parallel: Meili multi-search + pgvector personalized_semantic_search.
	const pgTypes = requestedIndexes
		.map((i) => INDEX_TO_PG_TYPE[i])
		.filter(Boolean) as string[];

	// Search with rewritten query if available — preserves original q for lexical
	// match by OR-ing synonyms (LLM rewrite + Postgres-backed) into the Meili
	// query string.
	const meiliQ = allSynonyms.length ? `${q} ${allSynonyms.join(" ")}` : q;
	const useHybrid = meiliQ.split(/\s+/).length >= 3;
	const [meili, sem] = await Promise.all([
		meiliMultiSearch(env, {
			indexes: requestedIndexes,
			query: meiliQ,
			filter: filterParts,
			facets: INDEX_FACETS,
			hitsPerPage,
			useHybrid,
		}),
		semanticSearch(env, {
			queryVec: blendedVec,
			contentTypes: pgTypes,
			biasWeight: biasVec ? 0.3 : 0,
			limit: 100,
		}),
	]);

	// Fuse: Meili rankingScore + pgvector score via RRF.
	const meiliHits = meili.hits.map((h: any, i: number) => ({ ...h, _source: "meili", _rank: i }));
	const semHits = sem.map((s, i) => ({
		...s,
		id: s.content_id,
		objectID: s.content_id,
		type: s.content_type,
		title: s.metadata?.title,
		city: s.metadata?.city,
		country: s.metadata?.country,
		category: s.metadata?.category,
		tags: s.metadata?.tags || [],
		slug: s.metadata?.slug,
		image_url: s.metadata?.image_url,
		featured: s.metadata?.featured || false,
		_source: "pg",
		_rank: i,
	}));
	const fused = rrfFuse([meiliHits, semHits], 60);

	// Personalization nudges (boost/decay).
	let ranked = personalizedRank(fused, signal, recent);

	// Cold-start fallback if starved.
	if (ranked.length < 5) {
		const popular = await popularEntities(env, pgTypes, 30);
		ranked = dedupeById([...ranked, ...popular.map((p) => ({ ...p, _source: "popular", _rankingScore: 0.1 }))]);
	}

	// Optional reranker on top-20.
	let final = ranked.slice(0, hitsPerPage);
	if (env.ENABLE_RERANKER === "1" && q.split(/\s+/).length >= 2) {
		const pool = ranked.slice(0, 20);
		const hydrated = await hydrateTitles(env, pool);
		const rrkd = await rerank(env, q, hydrated.map((h) => h._snippet || h.title || "")).catch(() => null);
		if (rrkd) {
			final = rrkd
				.map((r, i) => ({ ...pool[r.index], _rerank: r.score }))
				.sort((a, b) => (b._rerank || 0) - (a._rerank || 0))
				.slice(0, hitsPerPage);
		}
	}

	// Personalized facet reorder: user interest tags first, then by count.
	const reorderedFacets = reorderFacets(meili.facetDistribution, signal.recent_tags || [], signal.interests || []);

	const processingTimeMS = Date.now() - started;

	// Fire-and-forget analytics log.
	ctx.waitUntil(
		fetch(`${env.SUPABASE_URL}/rest/v1/rpc/log_search`, {
			method: "POST",
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				p_session_id: session_id ?? null,
				p_query: q,
				p_lang: lang,
				p_filters: mergedFilters,
				p_n_results: final.length,
				p_took_ms: processingTimeMS,
				p_had_rewrite: !!rewrite,
			}),
		}).catch(() => void 0),
	);

	return json(
		{
			hits: final,
			suggestions: final.slice(0, 5),
			nbHits: final.length,
			totalHits: meili.estimatedTotalHits,
			processingTimeMS,
			facetDistribution: reorderedFacets,
			debug: body.debug
				? {
						biasApplied: !!biasVec,
						biasEvents: signal.biasItems?.length || 0,
						semSize: sem.length,
						meiliSize: meiliHits.length,
						fusedSize: fused.length,
						embedModel,
						reranker: env.ENABLE_RERANKER === "1",
						rewrite,
						effectiveQ,
					}
				: undefined,
		},
		200,
		cors,
	);
}

// ─────────────────────────────────────────────
// /track
// ─────────────────────────────────────────────
async function handleTrack(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method" }, 405, cors);
	const body = (await request.json()) as {
		user_id?: string;
		session_id?: string;
		event_type: string;
		entity_type: string;
		entity_id: string;
		metadata?: Record<string, unknown>;
	};
	if (!body.event_type || !body.entity_type || !body.entity_id) {
		return json({ error: "missing fields" }, 400, cors);
	}
	const id = await trackEvent(env, body);

	// Record seen-recently in KV for decay (24h TTL).
	const sessionKey = body.user_id ? `u:${body.user_id}` : body.session_id ? `s:${body.session_id}` : null;
	if (sessionKey && (body.event_type === "view" || body.event_type === "click")) {
		await appendRecentSeen(env, sessionKey, `${body.entity_type}:${body.entity_id}`);
	}

	return json({ ok: true, id }, 200, cors);
}

// Seen-recently helpers — rolling set of last 50 entity ids per session, 24h TTL.
async function loadRecentSeen(env: Env, key: string): Promise<Set<string>> {
	const raw = (await env.SESSION_CACHE.get(`recent:${key}`, { type: "json" })) as string[] | null;
	return new Set(raw || []);
}

async function appendRecentSeen(env: Env, key: string, entityId: string): Promise<void> {
	const k = `recent:${key}`;
	const cur = ((await env.SESSION_CACHE.get(k, { type: "json" })) as string[] | null) || [];
	const next = [entityId, ...cur.filter((x) => x !== entityId)].slice(0, 50);
	try {
		await env.SESSION_CACHE.put(k, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 });
	} catch {
		/* KV quota */
	}
}

// ─────────────────────────────────────────────
// /onboarding
// ─────────────────────────────────────────────
async function handleOnboarding(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method" }, 405, cors);
	const body = (await request.json()) as {
		user_id: string;
		vibes?: string[];
		home_city?: string;
		languages?: string[];
	};
	if (!body.user_id) return json({ error: "user_id required" }, 400, cors);

	// Upsert minimal fields on profiles table.
	const patch = {
		interests: body.vibes ?? [],
		location: body.home_city ?? null,
		languages: body.languages ?? ["en"],
	};
	const res = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${body.user_id}`, {
		method: "PATCH",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			"Content-Type": "application/json",
			Prefer: "return=minimal",
		},
		body: JSON.stringify(patch),
	});
	if (!res.ok) return json({ error: "onboarding failed", details: await res.text() }, 500, cors);
	return json({ ok: true }, 200, cors);
}

// ─────────────────────────────────────────────
// /similar
// ─────────────────────────────────────────────
async function handleSimilar(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method" }, 405, cors);
	const { entity_type, entity_id, limit = 10, content_types } = (await request.json()) as any;
	if (!entity_type || !entity_id) return json({ error: "missing" }, 400, cors);

	// Fetch vector of seed.
	const seed = await fetch(
		`${env.SUPABASE_URL}/rest/v1/content_embeddings?content_type=eq.${entity_type}&content_id=eq.${entity_id}&select=embedding&limit=1`,
		{ headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
	).then((r) => r.json()) as any[];
	if (!seed?.[0]?.embedding) return json({ error: "no seed" }, 404, cors);

	const vec = parsePgVector(seed[0].embedding);
	const results = await semanticSearch(env, { queryVec: vec, contentTypes: content_types || null, biasWeight: 0, limit: limit + 1 });
	return json({ results: results.filter((r) => !(r.content_type === entity_type && r.content_id === entity_id)).slice(0, limit) }, 200, cors);
}

// ─────────────────────────────────────────────
// helpers (local to file)
// ─────────────────────────────────────────────

type SearchBody = {
	query: string;
	filters?: any;
	hitsPerPage?: number;
	user_id?: string;
	session_id?: string;
	lang?: "en" | "de" | "es" | "fr";
	debug?: boolean;
};

const INDEX_TO_PG_TYPE: Record<string, string> = {
	venues: "venue",
	events: "event",
	cities: "city",
	countries: "country",
	news: "news",
	marketplace: "marketplace",
	personalities: "personality",
	tags: "tag",
	queer_villages: "queer_village",
};

async function loadSignal(env: Env, who: { user_id?: string; session_id?: string }) {
	const [biasItems, sig] = await Promise.all([getBiasVector(env, who), getUserSignal(env, who)]);
	return {
		biasItems,
		interests: sig?.interests ?? [],
		languages: sig?.languages ?? [],
		home_city: sig?.home_city ?? null,
		recent_cities: sig?.recent_cities ?? [],
		recent_tags: sig?.recent_tags ?? [],
	};
}

function computeBias(items: { embedding: number[]; event_type: string; age_days: number }[] | null): number[] | null {
	if (!items || items.length === 0) return null;
	const w = (t: string) =>
		({ click: 1, view: 0.3, save: 3, favorite: 3, book: 5, attend: 5, dismiss: -1 }[t] ?? 0.5);
	const wsum: number[] = new Array(items[0].embedding.length).fill(0);
	let norm = 0;
	for (const it of items) {
		const weight = w(it.event_type) * Math.exp(-it.age_days / 14);
		norm += Math.abs(weight);
		for (let i = 0; i < it.embedding.length; i++) wsum[i] += weight * it.embedding[i];
	}
	if (norm === 0) return null;
	for (let i = 0; i < wsum.length; i++) wsum[i] /= norm;
	return l2Normalize(wsum);
}

function blendVectors(a: number[], b: number[], alpha: number): number[] {
	const out = new Array(a.length);
	for (let i = 0; i < a.length; i++) out[i] = alpha * a[i] + (1 - alpha) * b[i];
	return l2Normalize(out);
}

function l2Normalize(v: number[]): number[] {
	let s = 0;
	for (const x of v) s += x * x;
	s = Math.sqrt(s) || 1;
	return v.map((x) => x / s);
}

function rrfFuse(lists: any[][], k = 60): any[] {
	const scores = new Map<string, any>();
	for (const list of lists) {
		list.forEach((item, i) => {
			const id = itemId(item);
			if (!id) return;
			const prev = scores.get(id);
			const add = 1 / (k + i + 1);
			if (prev) prev._fused += add;
			else scores.set(id, { ...item, _fused: add });
		});
	}
	return [...scores.values()].sort((a, b) => b._fused - a._fused);
}

function itemId(h: any): string | null {
	if (h.id) return `${h.type || h.content_type || "x"}:${h.id}`;
	if (h.content_id) return `${h.content_type}:${h.content_id}`;
	return null;
}

function dedupeById(list: any[]): any[] {
	const seen = new Set<string>();
	const out: any[] = [];
	for (const it of list) {
		const id = itemId(it);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		out.push(it);
	}
	return out;
}

function reorderFacets(
	dist: Record<string, Record<string, number>>,
	recentTags: string[],
	interests: string[],
): Record<string, Array<{ value: string; count: number }>> {
	const prio = new Set([...recentTags, ...interests].filter(Boolean));
	const out: Record<string, Array<{ value: string; count: number }>> = {};
	for (const [facet, values] of Object.entries(dist || {})) {
		const entries = Object.entries(values).map(([value, count]) => ({ value, count }));
		entries.sort((a, b) => {
			const ap = prio.has(a.value) ? 1 : 0;
			const bp = prio.has(b.value) ? 1 : 0;
			if (ap !== bp) return bp - ap;
			return b.count - a.count;
		});
		out[facet] = entries;
	}
	return out;
}

async function hydrateTitles(env: Env, list: any[]): Promise<any[]> {
	// Meili hits already have title. pgvector hits may not — batch fetch missing.
	return list.map((h) => ({ ...h, _snippet: `${h.title ?? ""}. ${h.description ?? h.content_text ?? ""}`.slice(0, 400) }));
}

function parsePgVector(raw: any): number[] {
	if (Array.isArray(raw)) return raw;
	if (typeof raw === "string") return raw.replace(/^\[|\]$/g, "").split(",").map(Number);
	return [];
}

// ─────────────────────────────────────────────
// /autocomplete — fast prefix/typo suggestions from Meili across indexes
// ─────────────────────────────────────────────
async function handleAutocomplete(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method" }, 405, cors);
	const { query, limit = 6, types } = (await request.json()) as { query: string; limit?: number; types?: string[] };
	const q = query?.trim();
	if (!q) return json({ suggestions: [] }, 200, cors);

	const indexes = (types?.length
		? types.map((t) => INDEX_MAP[t] || t).filter((t) => ALL_INDEXES.includes(t))
		: ["venues", "events", "cities", "personalities"]) as string[];

	const meili = await meiliMultiSearch(env, {
		indexes,
		query: q,
		facets: INDEX_FACETS,
		hitsPerPage: limit,
		useHybrid: false, // lexical only — autocomplete must be < 40ms
	});

	const out = meili.hits.slice(0, limit).map((h: any) => ({
		id: h.id,
		type: h.type,
		title: h.title,
		city: h.city,
		country: h.country,
		slug: h.slug,
	}));
	return json({ suggestions: out }, 200, cors);
}

// ─────────────────────────────────────────────
// /trending — popular by type in the last N days, lightly personalized
// ─────────────────────────────────────────────
async function handleTrending(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method" }, 405, cors);
	const { types = ["venue", "event"], city, limit = 10, user_id, session_id } = (await request.json()) as any;

	// Query aggregate of user_events in last 7d by entity, weighted by action.
	const filterT = types.map((t: string) => `"${t}"`).join(",");
	const cityFilter = city ? `&city=eq.${encodeURIComponent(city)}` : "";
	const url = `${env.SUPABASE_URL}/rest/v1/rpc/get_trending_entities`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ p_types: types, p_city: city ?? null, p_limit: limit }),
	});
	if (!res.ok) {
		// Fallback: popular view only.
		const pop = await popularEntities(env, types, limit);
		return json({ trending: pop }, 200, cors);
	}
	const list = (await res.json()) as any[];

	// Soft personalization: if we have signal, boost items in user cities / interests.
	if (user_id || session_id) {
		const sig = await getUserSignal(env, { user_id, session_id });
		const citySet = new Set(
			[sig?.home_city, ...(sig?.recent_cities || [])].filter(Boolean).map((x: string) => x.toLowerCase()),
		);
		list.sort((a, b) => {
			const ab = citySet.has((a.city || "").toLowerCase()) ? 1 : 0;
			const bb = citySet.has((b.city || "").toLowerCase()) ? 1 : 0;
			if (ab !== bb) return bb - ab;
			return (b.score || 0) - (a.score || 0);
		});
	}
	return json({ trending: list.slice(0, limit) }, 200, cors);
}

// ─────────────────────────────────────────────
// /feedback — explicit thumbs up/down on a result
// ─────────────────────────────────────────────
async function handleFeedback(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method" }, 405, cors);
	const { user_id, session_id, query, entity_type, entity_id, vote } = (await request.json()) as any;
	if (!entity_type || !entity_id || !["up", "down"].includes(vote)) {
		return json({ error: "missing fields" }, 400, cors);
	}
	// Stored as user_events so it feeds bias vector naturally.
	const event_type = vote === "up" ? "save" : "dismiss";
	await trackEvent(env, {
		user_id,
		session_id,
		event_type,
		entity_type,
		entity_id,
		metadata: { source: "feedback", query },
	});
	return json({ ok: true }, 200, cors);
}

// ─────────────────────────────────────────────
// /admin/analytics — top queries, zero-hit queries (token-gated)
// ─────────────────────────────────────────────
async function handleAnalytics(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	const adminTok = request.headers.get("X-Admin-Token");
	if (!adminTok || adminTok !== env.ADMIN_TOKEN) return json({ error: "unauthorized" }, 401, cors);

	const [top, zero] = await Promise.all([
		fetch(`${env.SUPABASE_URL}/rest/v1/v_top_queries?select=*&limit=50`, {
			headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
		}).then((r) => r.json()),
		fetch(`${env.SUPABASE_URL}/rest/v1/v_zero_hit_queries?select=*&limit=50`, {
			headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
		}).then((r) => r.json()),
	]);

	return json({ top_queries: top, zero_hit: zero }, 200, cors);
}

// ─────────────────────────────────────────────
// Rate limit — sliding 1m window, 60 req per IP
// ─────────────────────────────────────────────
async function rateLimit(env: Env, request: Request): Promise<{ ok: boolean; retryAfter: number }> {
	const ip = request.headers.get("CF-Connecting-IP") || "anon";
	const nowMin = Math.floor(Date.now() / 1000 / 60);
	const key = `rl:${ip}:${nowMin}`;
	const cur = Number((await env.SESSION_CACHE.get(key)) ?? 0);
	if (cur >= 60) return { ok: false, retryAfter: 60 - (Math.floor(Date.now() / 1000) % 60) };
	// Fire and forget increment. Lossy under contention but fine for rate limit.
	env.SESSION_CACHE.put(key, String(cur + 1), { expirationTtl: 120 }).catch(() => void 0);
	return { ok: true, retryAfter: 0 };
}
