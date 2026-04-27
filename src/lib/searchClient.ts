/**
 * Client for the queer-guide-search-proxy v2 worker.
 * Provides personalization (track/feedback), discovery (similar/trending), autocomplete, onboarding.
 *
 * The main /search endpoint is wired via src/hooks/useSearch.tsx.
 * This module exposes the *additional* v2 endpoints that the hook doesn't cover.
 */

const SEARCH_URL =
	import.meta.env.VITE_SEARCH_PROXY_URL ||
	"https://queer-guide-search-proxy.maeder-tobiassimon.workers.dev";

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
	name?: string;
	category?: string;
	location?: string;
	city?: string;
	description?: string;
	[key: string]: unknown;
}

async function post<T>(path: string, body: object): Promise<T> {
	const res = await fetch(`${SEARCH_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		keepalive: true,
	});
	if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
	return (await res.json()) as T;
}

export type TrackEvent =
	| "click"
	| "view"
	| "save"
	| "favorite"
	| "book"
	| "attend"
	| "dismiss";

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

/** "More like this" — semantic neighbors of a given entity. */
export async function fetchSimilar(
	entity: { type: string; id: string },
	limit = 10,
): Promise<SearchHit[]> {
	const data = await post<{ results: SearchHit[] }>("/similar", {
		entity_type: entity.type,
		entity_id: entity.id,
		limit,
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
