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
import { detectScript, tokenize, isBareLgbtqQuery } from "./queryPrep";
import { resolveSession } from "./sessionCookie";
import { getCorsHeaders, getCorsHeadersOriginLocked, json, errorResponse } from "./util";
import {
	parseJsonBody,
	rejectUnknown,
	validString,
	validInt,
	validFilters,
	validEntityType,
	validEntityTypeArray,
	validTrackEvent,
	validUuid,
	validMetadata,
	sanitiseStoredString,
	MAX_HITS_PER_PAGE,
	MAX_PAGE,
	MIN_QUERY_LEN,
	MAX_QUERY_LEN,
	type ValidatedFilters,
} from "./validation";

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
	/**
	 * HMAC signing key for session-id cookies (bug #14). Set via
	 * `wrangler secret put SESSION_SIGNING_KEY`. When missing, the proxy
	 * falls back to unsigned session ids (dev only).
	 */
	SESSION_SIGNING_KEY?: string;
}

// Read endpoints: corpus is public, ACAO: *.
// Write endpoints: locked to ALLOWED_ORIGINS so the browser blocks cross-origin
// writes from random sites. (Server-side scrapers bypass CORS either way.)
const WRITE_PATHS = new Set(["/track", "/feedback", "/onboarding"]);

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const cors = WRITE_PATHS.has(url.pathname)
			? getCorsHeadersOriginLocked(request, env)
			: getCorsHeaders(request, env);
		if (request.method === "OPTIONS") return new Response(null, { headers: cors });

		// Rate limit: per-IP, per-endpoint sliding 1m window. /health bypasses.
		if (url.pathname !== "/health") {
			const rl = await rateLimit(env, request);
			if (!rl.ok) {
				return json(
					{ error: "rate_limited", code: "rate_limited", retry_after: rl.retryAfter, limit: rl.limit, window_seconds: 60 },
					429,
					{ ...cors, "Retry-After": String(rl.retryAfter), "X-RateLimit-Limit": String(rl.limit) },
				);
			}
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
					return json({ error: "not found", code: "not_found" }, 404, cors);
			}
		} catch (e) {
			console.error("handler error", e);
			try {
				sentry(env, request, ctx)?.captureException(e);
			} catch {
				/* sentry best-effort */
			}
			return json({ error: "internal", code: "internal", details: (e as Error)?.message ?? String(e) }, 500, cors);
		}
	},
};

// ─────────────────────────────────────────────
// /search
// ─────────────────────────────────────────────
async function handleSearch(request: Request, env: Env, ctx: ExecutionContext, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method", code: "method_not_allowed" }, 405, cors);
	const started = Date.now();
	const parsed = await parseJsonBody<Record<string, unknown>>(request);
	if (!parsed.ok) return errorResponse(parsed, cors);
	const body = parsed.value;

	const knownCheck = rejectUnknown(
		body,
		["query", "filters", "hitsPerPage", "page", "user_id", "session_id", "lang", "debug"],
		"body",
	);
	if (!knownCheck.ok) return errorResponse(knownCheck, cors);

	const queryR = validString(body.query, "query", { min: MIN_QUERY_LEN, max: MAX_QUERY_LEN });
	if (!queryR.ok) return errorResponse(queryR, cors);
	const q = queryR.value;

	// Bug #16: punctuation/emoji/control-only queries collapse to nothing
	// after tokenisation. Don't run the ranking pipeline on no signal.
	const tokens = tokenize(q);
	if (tokens.length === 0) {
		return json(
			{ hits: [], suggestions: [], facetDistribution: {}, processingTimeMS: Date.now() - started, reason: "empty_after_tokenize" },
			200,
			cors,
		);
	}

	// Bug #10: non-Latin script. Without aliases populated for the queried
	// city, fuzzy matching against the Latin index would return random
	// near-matches (柏林 → Bamberg). The aliases backfill (seed-city-aliases.sh)
	// covers the most-populous cities; for everything else we'd rather
	// return empty + a hint than a wrong answer.
	const script = detectScript(q);
	if (script !== "latin" && script !== "mixed") {
		// Try a strict alias match against the cities index. If none, give up.
		const aliasHits = await meiliMultiSearch(env, {
			indexes: ["cities"],
			query: q,
			facets: INDEX_FACETS,
			hitsPerPage: 5,
			useHybrid: false,
		}).catch(() => null);
		if (!aliasHits || aliasHits.hits.length === 0) {
			return json(
				{ hits: [], suggestions: [], facetDistribution: {}, processingTimeMS: Date.now() - started, reason: "unsupported_script", script },
				200,
				cors,
			);
		}
		// Fall through with the alias-matched seed hits as the primary result.
		return json(
			{ hits: aliasHits.hits, suggestions: aliasHits.hits.slice(0, 5), facetDistribution: {}, processingTimeMS: Date.now() - started, script },
			200,
			cors,
		);
	}

	const filtersR = validFilters(body.filters);
	if (!filtersR.ok) return errorResponse(filtersR, cors);
	const filters: ValidatedFilters = filtersR.value;

	const hppR = validInt(body.hitsPerPage, "hitsPerPage", { min: 1, max: MAX_HITS_PER_PAGE, default: 20, clamp: true });
	if (!hppR.ok) return errorResponse(hppR, cors);
	const hitsPerPage = hppR.value;

	const pageR = validInt(body.page, "page", { min: 0, max: MAX_PAGE, default: 0 });
	if (!pageR.ok) return errorResponse(pageR, cors);
	const page = pageR.value;

	const lang = (typeof body.lang === "string" && ["en", "de", "es", "fr"].includes(body.lang) ? body.lang : "en") as "en" | "de" | "es" | "fr";
	const user_id = typeof body.user_id === "string" ? body.user_id : undefined;
	const session_id = typeof body.session_id === "string" ? body.session_id : undefined;
	const debug = body.debug === true;

	// Bug #9: a bare LGBTQ+ token query ('gay', 'queer', 'trans') is a
	// stop-word in the venue/event indexes — running it through the full
	// pipeline takes ~6s for an essentially random ranking. Route it to
	// the popular-entities path (sub-200ms) instead.
	if (isBareLgbtqQuery(tokens)) {
		const popular = await popularEntities(env, ["venue", "event"], hitsPerPage * (page + 1));
		const slice = popular.slice(page * hitsPerPage, (page + 1) * hitsPerPage);
		return json(
			{
				hits: slice,
				suggestions: slice.slice(0, 5),
				nbHits: slice.length,
				page,
				hitsPerPage,
				totalHits: popular.length,
				facetDistribution: {},
				processingTimeMS: Date.now() - started,
				reason: "bare_stopword_query",
			},
			200,
			cors,
		);
	}

	// Query rewrite: translates non-EN, extracts intent hints (city, type), adds synonyms.
	// Enabled when lang != en OR query is short (< 3 words). Skipped for power queries.
	const shouldRewrite = lang !== "en" || q.split(/\s+/).length < 3;
	const rewrite = shouldRewrite ? await rewriteQuery(env, q, lang) : null;

	const effectiveQ = rewrite?.q_en || q;
	const mergedFilters: ValidatedFilters = { ...filters };
	if (rewrite?.city && !mergedFilters.city && !mergedFilters.location) mergedFilters.city = rewrite.city;
	// Normalise type/types: collapse `type` into `types` for downstream code.
	// Note: rewrite.type_hint is intentionally NOT used to narrow indexes.
	// Doing so previously caused single-word city queries ("berlin") to be
	// restricted to the cities index, where Meilisearch's typo tolerance
	// pushed Berlin out of the top 75 hits and yielded irrelevant results.
	// We rely on the exact-title boost in personalizedRank instead.
	const allTypes: string[] = [
		...(mergedFilters.type ? [mergedFilters.type] : []),
		...(mergedFilters.types ?? []),
	];

	const requestedIndexes: string[] = allTypes.length
		? [...new Set<string>(allTypes.map((t) => INDEX_MAP[t] || t).filter((t) => ALL_INDEXES.includes(t)))]
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
			page,
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
	const meiliHits = meili.hits.map((h, i: number) => ({ ...h, _source: "meili", _rank: i }));
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

	// Personalization nudges (boost/decay) + worker-side exact-title boost
	// for bug #4 (until the Meilisearch index ranking rules are reconfigured).
	let ranked = personalizedRank(fused, signal, recent, q);

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
				.map((r) => ({ ...pool[r.index], _rerank: r.score }))
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
			page,
			hitsPerPage,
			totalHits: meili.estimatedTotalHits,
			processingTimeMS,
			facetDistribution: reorderedFacets,
			debug: debug
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
// Per-event-type metadata schemas. Anything not listed here is rejected — see
// validation.validMetadata + sanitiseStoredString. This blocks the XSS/SQL
// injection vector demonstrated in bug #11 (a `<script>` literal landing in
// stored metadata that admin tooling later renders unescaped).
const METADATA_KEYS_BY_EVENT: Record<string, readonly string[]> = {
	click: ["source", "position", "query"],
	view: ["source", "duration_ms"],
	save: ["source"],
	favorite: ["source"],
	book: ["source", "amount", "currency"],
	attend: ["source"],
	dismiss: ["source", "query"],
};

async function handleTrack(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method", code: "method_not_allowed" }, 405, cors);
	const parsed = await parseJsonBody<Record<string, unknown>>(request);
	if (!parsed.ok) return errorResponse(parsed, cors);
	const body = parsed.value;

	const knownCheck = rejectUnknown(
		body,
		["user_id", "session_id", "event_type", "entity_type", "entity_id", "metadata"],
		"body",
	);
	if (!knownCheck.ok) return errorResponse(knownCheck, cors);

	const eventR = validTrackEvent(body.event_type);
	if (!eventR.ok) return errorResponse(eventR, cors);
	const event_type = eventR.value;

	const entityTypeR = validEntityType(body.entity_type);
	if (!entityTypeR.ok) return errorResponse(entityTypeR, cors);
	const entity_type = entityTypeR.value;

	const entityIdR = validUuid(body.entity_id, "entity_id");
	if (!entityIdR.ok) return errorResponse(entityIdR, cors);
	const entity_id = entityIdR.value;

	const allowedKeys = METADATA_KEYS_BY_EVENT[event_type] ?? [];
	const metadataR = validMetadata(body.metadata, allowedKeys);
	if (!metadataR.ok) return errorResponse(metadataR, cors);
	const metadata = metadataR.value;

	const user_id = typeof body.user_id === "string" ? body.user_id : undefined;
	const bodySid = typeof body.session_id === "string" ? body.session_id : undefined;
	// Bug #14: trust the signed cookie over the body. Mints a fresh signed
	// cookie if there isn't one yet so future calls bypass the body field.
	const session = await resolveSession(request, env, bodySid);
	const session_id = session.sid;

	const id = await trackEvent(env, { user_id, session_id, event_type, entity_type, entity_id, metadata });

	// Record seen-recently in KV for decay (24h TTL).
	const sessionKey = user_id ? `u:${user_id}` : session_id ? `s:${session_id}` : null;
	if (sessionKey && (event_type === "view" || event_type === "click")) {
		await appendRecentSeen(env, sessionKey, `${entity_type}:${entity_id}`);
	}

	const headers: Record<string, string> = { ...(cors as Record<string, string>) };
	if (session.setCookie) headers["Set-Cookie"] = session.setCookie;
	return json({ ok: true, id, session_verified: session.verified }, 200, headers);
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
	if (request.method !== "POST") return json({ error: "method", code: "method_not_allowed" }, 405, cors);
	const parsed = await parseJsonBody<Record<string, unknown>>(request);
	if (!parsed.ok) return errorResponse(parsed, cors);
	const body = parsed.value;

	const knownCheck = rejectUnknown(body, ["user_id", "vibes", "home_city", "languages"], "body");
	if (!knownCheck.ok) return errorResponse(knownCheck, cors);

	const userIdR = validUuid(body.user_id, "user_id");
	if (!userIdR.ok) return errorResponse(userIdR, cors);
	const user_id = userIdR.value;

	const sanitisedArray = (v: unknown, field: string, max = 32): { ok: true; value: string[] } | { ok: false; status: number; error: string; code: string; field?: string } => {
		if (v === undefined) return { ok: true, value: [] };
		if (!Array.isArray(v)) return { ok: false, status: 400, error: `${field} must be an array`, code: "type_error", field };
		if (v.length > max) return { ok: false, status: 400, error: `${field} too long`, code: "too_long", field };
		const out: string[] = [];
		for (const item of v) {
			const r = sanitiseStoredString(item, `${field}[]`, 64);
			if (!r.ok) return r;
			out.push(r.value);
		}
		return { ok: true, value: out };
	};

	const vibesR = sanitisedArray(body.vibes, "vibes");
	if (!vibesR.ok) return errorResponse(vibesR, cors);
	const langsR = sanitisedArray(body.languages, "languages", 8);
	if (!langsR.ok) return errorResponse(langsR, cors);
	let home_city: string | null = null;
	if (body.home_city !== undefined && body.home_city !== null) {
		const r = sanitiseStoredString(body.home_city, "home_city", 100);
		if (!r.ok) return errorResponse(r, cors);
		home_city = r.value;
	}

	const patch = {
		interests: vibesR.value,
		location: home_city,
		languages: langsR.value.length ? langsR.value : ["en"],
	};
	const res = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${user_id}`, {
		method: "PATCH",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			"Content-Type": "application/json",
			Prefer: "return=minimal",
		},
		body: JSON.stringify(patch),
	});
	if (!res.ok) return json({ error: "onboarding failed", code: "upstream_error", details: await res.text() }, 502, cors);
	return json({ ok: true }, 200, cors);
}

// ─────────────────────────────────────────────
// /similar
// ─────────────────────────────────────────────
async function handleSimilar(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method", code: "method_not_allowed" }, 405, cors);
	const parsed = await parseJsonBody<Record<string, unknown>>(request);
	if (!parsed.ok) return errorResponse(parsed, cors);
	const body = parsed.value;
	const knownCheck = rejectUnknown(body, ["entity_type", "entity_id", "limit", "content_types"], "body");
	if (!knownCheck.ok) return errorResponse(knownCheck, cors);

	const entityTypeR = validEntityType(body.entity_type);
	if (!entityTypeR.ok) return errorResponse(entityTypeR, cors);
	const entity_type = entityTypeR.value;
	const entityIdR = validUuid(body.entity_id, "entity_id");
	if (!entityIdR.ok) return errorResponse(entityIdR, cors);
	const entity_id = entityIdR.value;
	const limitR = validInt(body.limit, "limit", { min: 1, max: 50, default: 10, clamp: true });
	if (!limitR.ok) return errorResponse(limitR, cors);
	const limit = limitR.value;
	let content_types: string[] | null = null;
	if (body.content_types !== undefined && body.content_types !== null) {
		const r = validEntityTypeArray(body.content_types, "content_types");
		if (!r.ok) return errorResponse(r, cors);
		content_types = r.value;
	}

	// Fetch vector of seed. Both fields are validated UUIDs / enum so safe to inline.
	const seed = (await fetch(
		`${env.SUPABASE_URL}/rest/v1/content_embeddings?content_type=eq.${entity_type}&content_id=eq.${entity_id}&select=embedding&limit=1`,
		{ headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
	).then((r) => r.json())) as Array<{ embedding: unknown }>;
	if (!seed?.[0]?.embedding) return json({ error: "no seed", code: "not_found" }, 404, cors);

	const vec = parsePgVector(seed[0].embedding);
	const results = await semanticSearch(env, { queryVec: vec, contentTypes: content_types, biasWeight: 0, limit: limit + 1 });
	return json({ results: results.filter((r) => !(r.content_type === entity_type && r.content_id === entity_id)).slice(0, limit) }, 200, cors);
}

// ─────────────────────────────────────────────
// helpers (local to file)
// ─────────────────────────────────────────────

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

type FuseItem = {
	id?: string;
	content_id?: string;
	type?: string;
	content_type?: string;
	_fused?: number;
	[key: string]: unknown;
};

function rrfFuse(lists: FuseItem[][], k = 60): FuseItem[] {
	const scores = new Map<string, FuseItem>();
	for (const list of lists) {
		list.forEach((item, i) => {
			const id = itemId(item);
			if (!id) return;
			const prev = scores.get(id);
			const add = 1 / (k + i + 1);
			if (prev) prev._fused = (prev._fused ?? 0) + add;
			else scores.set(id, { ...item, _fused: add });
		});
	}
	return [...scores.values()].sort((a, b) => (b._fused ?? 0) - (a._fused ?? 0));
}

function itemId(h: FuseItem): string | null {
	if (h.id) return `${h.type || h.content_type || "x"}:${h.id}`;
	if (h.content_id) return `${h.content_type}:${h.content_id}`;
	return null;
}

function dedupeById(list: FuseItem[]): FuseItem[] {
	const seen = new Set<string>();
	const out: FuseItem[] = [];
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

type HydratableHit = {
	title?: string;
	description?: string;
	content_text?: string;
	_snippet?: string;
	[key: string]: unknown;
};

async function hydrateTitles(_env: Env, list: HydratableHit[]): Promise<HydratableHit[]> {
	// Meili hits already have title. pgvector hits may not — batch fetch missing.
	return list.map((h) => ({
		...h,
		_snippet: `${h.title ?? ""}. ${h.description ?? h.content_text ?? ""}`.slice(0, 400),
	}));
}

function parsePgVector(raw: unknown): number[] {
	if (Array.isArray(raw)) return raw.map(Number);
	if (typeof raw === "string") return raw.replace(/^\[|\]$/g, "").split(",").map(Number);
	return [];
}

// ─────────────────────────────────────────────
// /autocomplete — fast prefix/typo suggestions from Meili across indexes
// ─────────────────────────────────────────────
async function handleAutocomplete(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method", code: "method_not_allowed" }, 405, cors);
	const parsed = await parseJsonBody<Record<string, unknown>>(request);
	if (!parsed.ok) return errorResponse(parsed, cors);
	const body = parsed.value;
	const knownCheck = rejectUnknown(body, ["query", "limit", "types"], "body");
	if (!knownCheck.ok) return errorResponse(knownCheck, cors);

	const queryR = validString(body.query, "query", { min: MIN_QUERY_LEN, max: MAX_QUERY_LEN });
	if (!queryR.ok) return errorResponse(queryR, cors);
	const q = queryR.value;

	const limitR = validInt(body.limit, "limit", { min: 1, max: 20, default: 6, clamp: true });
	if (!limitR.ok) return errorResponse(limitR, cors);
	const limit = limitR.value;

	let indexes: string[];
	if (body.types !== undefined) {
		const r = validEntityTypeArray(body.types, "types");
		if (!r.ok) return errorResponse(r, cors);
		indexes = [...new Set(r.value.map((t) => INDEX_MAP[t]).filter((t) => ALL_INDEXES.includes(t)))];
		if (indexes.length === 0) {
			// All requested types had no Meilisearch index — return empty rather than
			// silently widening (which would mask the caller's bug).
			return json({ suggestions: [] }, 200, cors);
		}
	} else {
		indexes = ["venues", "events", "cities", "personalities"];
	}

	const meili = await meiliMultiSearch(env, {
		indexes,
		query: q,
		facets: INDEX_FACETS,
		hitsPerPage: limit,
		useHybrid: false, // lexical only — autocomplete must be < 40ms
	});

	const out = meili.hits.slice(0, limit).map((h) => ({
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
	if (request.method !== "POST") return json({ error: "method", code: "method_not_allowed" }, 405, cors);
	const parsed = await parseJsonBody<Record<string, unknown>>(request);
	if (!parsed.ok) return errorResponse(parsed, cors);
	const body = parsed.value;
	const knownCheck = rejectUnknown(body, ["types", "city", "limit", "user_id", "session_id"], "body");
	if (!knownCheck.ok) return errorResponse(knownCheck, cors);

	const TRENDING_DEFAULT_TYPES = ["venue", "event"] as const;
	let types: string[];
	if (body.types === undefined) {
		types = [...TRENDING_DEFAULT_TYPES];
	} else {
		const r = validEntityTypeArray(body.types, "types");
		if (!r.ok) return errorResponse(r, cors);
		// Empty array means "all types" — historically returned 0, which surprised callers (bug #17).
		types = r.value.length ? r.value : [...TRENDING_DEFAULT_TYPES];
	}

	let city: string | null = null;
	if (body.city !== undefined && body.city !== null) {
		const r = validString(body.city, "city", { max: 100 });
		if (!r.ok) return errorResponse(r, cors);
		city = r.value;
	}

	const limitR = validInt(body.limit, "limit", { min: 1, max: 50, default: 10, clamp: true });
	if (!limitR.ok) return errorResponse(limitR, cors);
	const limit = limitR.value;

	const user_id = typeof body.user_id === "string" ? body.user_id : undefined;
	const session_id = typeof body.session_id === "string" ? body.session_id : undefined;

	// Bug #9: edge cache. Trending only changes meaningfully every few minutes
	// and the underlying RPC is the slowest endpoint per p95 (~1-3s). Cache
	// keyed by (types, city, limit). Personalised responses bypass the cache.
	const isPersonal = !!(user_id || session_id);
	const cacheKey = isPersonal
		? null
		: new Request(
			`https://search.queer.guide/_cache/trending?t=${types.slice().sort().join(",")}&c=${encodeURIComponent(city ?? "")}&l=${limit}`,
		);
	const cache = (caches as unknown as { default: Cache }).default;
	if (cacheKey) {
		const cached = await cache.match(cacheKey).catch(() => null);
		if (cached) {
			// Re-attach CORS — Cloudflare's edge cache doesn't store/replay
			// per-origin headers in a useful way for us.
			const body = await cached.text();
			return new Response(body, {
				status: 200,
				headers: { ...cors, "Content-Type": "application/json", "X-Cache": "HIT" },
			});
		}
	}

	const url = `${env.SUPABASE_URL}/rest/v1/rpc/get_trending_entities`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ p_types: types, p_city: city, p_limit: limit }),
	});
	if (!res.ok) {
		// Fallback: popular view only.
		const pop = await popularEntities(env, types, limit);
		return json({ trending: pop }, 200, cors);
	}
	const list = (await res.json()) as Array<{ city?: string; score?: number; [k: string]: unknown }>;

	// Soft personalization: if we have signal, boost items in user cities / interests.
	if (isPersonal) {
		const sig = await getUserSignal(env, { user_id, session_id });
		const citySet = new Set(
			[sig?.home_city, ...(sig?.recent_cities || [])]
				.filter((x): x is string => Boolean(x))
				.map((x) => x.toLowerCase()),
		);
		list.sort((a, b) => {
			const ab = citySet.has((a.city || "").toLowerCase()) ? 1 : 0;
			const bb = citySet.has((b.city || "").toLowerCase()) ? 1 : 0;
			if (ab !== bb) return bb - ab;
			return (b.score || 0) - (a.score || 0);
		});
	}

	const payload = JSON.stringify({ trending: list.slice(0, limit) });
	if (cacheKey) {
		// 5-minute TTL. Stale-while-revalidate gives us 1 minute of grace.
		const cacheable = new Response(payload, {
			status: 200,
			headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300, stale-while-revalidate=60" },
		});
		// Don't await — fire and forget so the user doesn't pay for the cache write.
		(globalThis as unknown as { ctx?: ExecutionContext }).ctx?.waitUntil?.(cache.put(cacheKey, cacheable.clone()));
		await cache.put(cacheKey, cacheable).catch(() => void 0);
	}
	return new Response(payload, {
		status: 200,
		headers: { ...cors, "Content-Type": "application/json", "X-Cache": "MISS" },
	});
}

// ─────────────────────────────────────────────
// /feedback — explicit thumbs up/down on a result
// ─────────────────────────────────────────────
async function handleFeedback(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
	if (request.method !== "POST") return json({ error: "method", code: "method_not_allowed" }, 405, cors);
	const parsed = await parseJsonBody<Record<string, unknown>>(request);
	if (!parsed.ok) return errorResponse(parsed, cors);
	const body = parsed.value;
	const knownCheck = rejectUnknown(body, ["user_id", "session_id", "query", "entity_type", "entity_id", "vote"], "body");
	if (!knownCheck.ok) return errorResponse(knownCheck, cors);

	const entityTypeR = validEntityType(body.entity_type);
	if (!entityTypeR.ok) return errorResponse(entityTypeR, cors);
	const entityIdR = validUuid(body.entity_id, "entity_id");
	if (!entityIdR.ok) return errorResponse(entityIdR, cors);
	if (body.vote !== "up" && body.vote !== "down") {
		return errorResponse({ ok: false, status: 400, error: "vote must be 'up' or 'down'", code: "invalid_enum", field: "vote" }, cors);
	}
	let query: string | undefined;
	if (body.query !== undefined && body.query !== null) {
		const r = sanitiseStoredString(body.query, "query", MAX_QUERY_LEN);
		if (!r.ok) return errorResponse(r, cors);
		query = r.value;
	}
	const user_id = typeof body.user_id === "string" ? body.user_id : undefined;
	const bodySid = typeof body.session_id === "string" ? body.session_id : undefined;
	const session = await resolveSession(request, env, bodySid);

	const event_type = body.vote === "up" ? "save" : "dismiss";
	await trackEvent(env, {
		user_id,
		session_id: session.sid,
		event_type,
		entity_type: entityTypeR.value,
		entity_id: entityIdR.value,
		metadata: { source: "feedback", ...(query ? { query } : {}) },
	});
	const headers: Record<string, string> = { ...(cors as Record<string, string>) };
	if (session.setCookie) headers["Set-Cookie"] = session.setCookie;
	return json({ ok: true, session_verified: session.verified }, 200, headers);
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
// Rate limit — sliding 1m window, per-IP, per-endpoint quota.
//
// Bug #13: 50 concurrent requests from one IP all returned 200, because the
// previous limit was a single 60/min/IP bucket shared across every endpoint.
// /track and /onboarding deserve much tighter caps because they write
// state — and a runaway autocomplete loop shouldn't drain the budget for
// /search.
//
// /health bypasses entirely (uptime probes).
// ─────────────────────────────────────────────
const RATE_LIMITS: Record<string, number> = {
	"/": 60,
	"/search": 60,
	"/autocomplete": 120, // typed every keystroke; needs a wider lane
	"/trending": 60,
	"/similar": 60,
	"/feedback": 30,
	"/track": 60,
	"/onboarding": 10,
	"/admin/analytics": 30,
};
const RATE_LIMIT_DEFAULT = 60;

async function rateLimit(env: Env, request: Request): Promise<{ ok: boolean; retryAfter: number; limit: number }> {
	const ip = request.headers.get("CF-Connecting-IP") || "anon";
	const path = new URL(request.url).pathname;
	const limit = RATE_LIMITS[path] ?? RATE_LIMIT_DEFAULT;
	const nowSec = Math.floor(Date.now() / 1000);
	const nowMin = Math.floor(nowSec / 60);
	const key = `rl:${path}:${ip}:${nowMin}`;
	const cur = Number((await env.SESSION_CACHE.get(key)) ?? 0);
	if (cur >= limit) return { ok: false, retryAfter: 60 - (nowSec % 60), limit };
	// Fire and forget increment. Lossy under contention but fine for rate limit.
	env.SESSION_CACHE.put(key, String(cur + 1), { expirationTtl: 120 }).catch(() => void 0);
	return { ok: true, retryAfter: 0, limit };
}
