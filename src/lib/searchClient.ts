/**
 * Client for the queer-guide-search-proxy v2 worker.
 * Provides personalization (track/feedback), discovery (similar/trending), autocomplete, onboarding.
 *
 * The main /search endpoint is wired via src/hooks/useSearch.tsx.
 * This module exposes the *additional* v2 endpoints that the hook doesn't cover.
 */

const SEARCH_URL =
	import.meta.env.VITE_SEARCH_PROXY_URL ||
	"https://search.queer.guide";

const SESSION_KEY = "qg_sid";

export function getSessionId(): string {
	if (typeof window === "undefined") return "";
	const existing = localStorage.getItem(SESSION_KEY);
	if (existing) return existing;
	const id = crypto.randomUUID();
	localStorage.setItem(SESSION_KEY, id);
	return id;
}

export interface SearchHit {
	id: string;
	objectID?: string;
	type: string;
	title?: string;
	/** Meili-highlighted title (HTML with <em>match</em>). Only set on /autocomplete responses. */
	title_formatted?: string | null;
	name?: string;
	category?: string;
	location?: string;
	city?: string;
	description?: string;
	[key: string]: unknown;
}

// Write endpoints (/track, /feedback, /onboarding) need credentials: 'include'
// so the signed qg_sid cookie travels — the worker uses it to verify the
// session id (bug #14). Read endpoints don't need credentials and stay
// `same-origin` to keep CORS simple.
const WRITE_PATHS = new Set(["/track", "/feedback", "/onboarding"]);

async function post<T>(path: string, body: object): Promise<T> {
	const res = await fetch(`${SEARCH_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		credentials: WRITE_PATHS.has(path) ? "include" : "same-origin",
		keepalive: true,
	});
	if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
	const data = (await res.json()) as T & { session_verified?: boolean };
	// One-shot migration: once the worker confirms it has a verified signed
	// cookie for this session, drop the legacy localStorage id so future
	// sessions rely on the cookie alone.
	if (data?.session_verified && typeof window !== "undefined") {
		try { localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
	}
	return data;
}

export type TrackEvent =
	| "click"
	| "view"
	| "save"
	| "favorite"
	| "book"
	| "attend"
	| "dismiss"
	| "search_submit"
	| "facet_apply"
	| "zero_results";

/** Fire-and-forget user event — feeds the bias vector for personalization. */
export async function trackSearchEvent(
	event: TrackEvent,
	entity: { type: string; id: string },
	metadata: Record<string, unknown> = {},
	userId?: string | null,
): Promise<void> {
	try {
		await post("/track", {
			user_id: userId ?? null,
			session_id: getSessionId(),
			event_type: event,
			entity_type: entity.type,
			entity_id: entity.id,
			metadata,
		});
	} catch {
		/* best-effort */
	}
}

/**
 * Fire a UX telemetry event for the searchbar — search_submit, facet_apply,
 * zero_results. Uses a synthetic entity ("search:query") so the existing
 * /track schema can store it without changes.
 */
export async function trackSearchUx(
	event: Extract<TrackEvent, "search_submit" | "facet_apply" | "zero_results">,
	metadata: Record<string, unknown>,
	userId?: string | null,
): Promise<void> {
	await trackSearchEvent(event, { type: "search", id: String(metadata.query ?? "") }, metadata, userId);
}

/** Thumbs up/down on a result — stored as save/dismiss to feed bias. */
export async function submitFeedback(
	entity: { type: string; id: string },
	vote: "up" | "down",
	query?: string,
	userId?: string | null,
): Promise<void> {
	await post("/feedback", {
		user_id: userId ?? null,
		session_id: getSessionId(),
		entity_type: entity.type,
		entity_id: entity.id,
		vote,
		query,
	});
}

/** Persist initial preferences at signup. */
export async function submitOnboarding(
	userId: string,
	prefs: { vibes?: string[]; home_city?: string; languages?: string[] },
): Promise<void> {
	await post("/onboarding", { user_id: userId, ...prefs });
}

/**
 * "More like this" — semantic neighbors of a given entity.
 *
 * `contentTypes` restricts the result set to specific entity types — pass
 * `['personality']` from a personality detail page to keep articles and
 * other cross-type hits out of the related rail.
 */
export async function fetchSimilar(
	entity: { type: string; id: string },
	limit = 10,
	contentTypes?: string[],
): Promise<SearchHit[]> {
	const data = await post<{ results: SearchHit[] }>("/similar", {
		entity_type: entity.type,
		entity_id: entity.id,
		limit,
		...(contentTypes && contentTypes.length > 0 ? { content_types: contentTypes } : {}),
	});
	return data.results ?? [];
}

/** Trending entities by 7d weighted popularity (clicks + saves). */
export async function fetchTrending(
	types: string[] = ["venue", "event"],
	city?: string,
	limit = 10,
	userId?: string | null,
): Promise<SearchHit[]> {
	const data = await post<{ trending: SearchHit[] }>("/trending", {
		types,
		city,
		limit,
		user_id: userId ?? null,
		session_id: getSessionId(),
	});
	return data.trending ?? [];
}

/** Fast lexical autocomplete — typo-tolerant Meili prefix match. */
export async function fetchAutocomplete(
	query: string,
	types?: string[],
	limit = 6,
): Promise<SearchHit[]> {
	if (!query?.trim()) return [];
	const data = await post<{ suggestions: SearchHit[] }>("/autocomplete", {
		query,
		types,
		limit,
	});
	return data.suggestions ?? [];
}
