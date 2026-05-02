/**
 * queer.guide search client SDK.
 * Works in browser and Node. Handles session id, batches track events.
 */

export interface QGSearchClientOptions {
	endpoint: string; // e.g. https://search.queer.guide
	userId?: string | null;
	lang?: "en" | "de" | "es" | "fr";
	storageKey?: string; // localStorage key for session id
}

export interface SearchFilters {
	types?: string[];
	city?: string;
	country?: string;
	location?: string;
	categories?: string[];
	tags?: string[];
	featured?: boolean;
	lat?: number;
	lng?: number;
	radius?: number; // km
	date_from?: string; // ISO
	date_to?: string;
}

export interface SearchHit {
	id?: string;
	objectID?: string;
	type?: string;
	content_type?: string;
	title?: string;
	name?: string;
	description?: string;
	category?: string;
	city?: string;
	country?: string;
	_geoloc?: { lat: number; lng: number };
	image_url?: string;
	slug?: string;
	start_date?: string | number;
	end_date?: string | number;
	featured?: boolean;
	tags?: string[];
	_rankingScore?: number;
	[key: string]: unknown;
}

export interface SearchResult {
	hits: SearchHit[];
	suggestions: SearchHit[];
	nbHits: number;
	totalHits: number;
	processingTimeMS: number;
	facetDistribution: Record<string, Array<{ value: string; count: number }>>;
}

export type TrackEvent =
	| "click"
	| "view"
	| "save"
	| "favorite"
	| "book"
	| "attend"
	| "dismiss";

const DEFAULT_STORAGE_KEY = "qg_sid";

export class QGSearchClient {
	private opts: QGSearchClientOptions;
	private sessionId: string;
	private trackQueue: Array<Record<string, unknown>> = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(opts: QGSearchClientOptions) {
		this.opts = { lang: "en", storageKey: DEFAULT_STORAGE_KEY, ...opts };
		this.sessionId = this.loadOrCreateSession();
	}

	private loadOrCreateSession(): string {
		const key = this.opts.storageKey!;
		if (typeof localStorage !== "undefined") {
			const existing = localStorage.getItem(key);
			if (existing) return existing;
			const id = crypto.randomUUID();
			localStorage.setItem(key, id);
			return id;
		}
		return crypto.randomUUID();
	}

	setUser(userId: string | null) {
		this.opts.userId = userId;
	}

	async search(query: string, filters: SearchFilters = {}, hitsPerPage = 20, debug = false): Promise<SearchResult> {
		const res = await fetch(`${this.opts.endpoint}/search`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				query,
				filters,
				hitsPerPage,
				user_id: this.opts.userId ?? null,
				session_id: this.sessionId,
				lang: this.opts.lang,
				debug,
			}),
		});
		if (!res.ok) throw new Error(`search ${res.status}: ${await res.text()}`);
		return (await res.json()) as SearchResult;
	}

	/** Queue an event. Flushes on next frame or after 500ms. */
	track(
		event: TrackEvent,
		entity: { type: string; id: string },
		metadata: Record<string, unknown> = {},
	) {
		this.trackQueue.push({
			user_id: this.opts.userId ?? null,
			session_id: this.sessionId,
			event_type: event,
			entity_type: entity.type,
			entity_id: entity.id,
			metadata,
		});
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => this.flushTrack(), 500);
	}

	async flushTrack(): Promise<void> {
		this.flushTimer = null;
		const q = this.trackQueue.splice(0);
		if (!q.length) return;
		// Best-effort, fire-and-forget.
		await Promise.all(
			q.map((body) =>
				fetch(`${this.opts.endpoint}/track`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
					keepalive: true,
				}).catch(() => void 0),
			),
		);
	}

	async onboarding(prefs: { vibes?: string[]; home_city?: string; languages?: string[] }): Promise<void> {
		if (!this.opts.userId) throw new Error("userId required for onboarding");
		await fetch(`${this.opts.endpoint}/onboarding`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ user_id: this.opts.userId, ...prefs }),
		});
	}

	async feedback(entity: { type: string; id: string }, vote: "up" | "down", query?: string): Promise<void> {
		await fetch(`${this.opts.endpoint}/feedback`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				user_id: this.opts.userId ?? null,
				session_id: this.sessionId,
				entity_type: entity.type,
				entity_id: entity.id,
				vote,
				query,
			}),
			keepalive: true,
		});
	}

	async similar(entity: { type: string; id: string }, limit = 10): Promise<SearchHit[]> {
		const res = await fetch(`${this.opts.endpoint}/similar`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ entity_type: entity.type, entity_id: entity.id, limit }),
		});
		if (!res.ok) throw new Error(`similar ${res.status}`);
		const data = (await res.json()) as { results: SearchHit[] };
		return data.results ?? [];
	}
}
