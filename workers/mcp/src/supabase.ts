/**
 * Supabase access for the MCP worker.
 *
 *  - Public reads go through `rpc()` with the ANON key — every discovery RPC is
 *    granted to `anon`, so no service-role key lives in this public worker.
 *  - Authenticated writes go through `authedFetch()` with the USER's Supabase
 *    JWT (held in the OAuth grant props), so the platform's existing RLS
 *    policies authorize them — no privilege escalation through MCP. On a 401
 *    the access token is refreshed once via the refresh token.
 *  - GoTrue helpers (`sendOtp` / `verifyOtp` / `refreshSession`) back the
 *    email-OTP login the OAuth authorize page uses.
 */

import type { Env, Props } from "./types";

const RPC_TIMEOUT_MS = 8000;

/** Read-only RPC with the anon key (all discovery RPCs are granted to anon). */
export async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("rpc-timeout"), RPC_TIMEOUT_MS);
	try {
		const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
			method: "POST",
			headers: {
				apikey: env.SUPABASE_ANON_KEY,
				authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(args),
			signal: controller.signal,
		});
		if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${await res.text()}`);
		return (await res.json()) as T;
	} finally {
		clearTimeout(timer);
	}
}

// ── Authenticated writes (user JWT + RLS) ───────────────────────────────────

export interface TokenHolder {
	env: Env;
	props: Props;
}

/**
 * Fetch with the user's Supabase JWT. The OAuth token-exchange callback keeps
 * this token fresh (refreshes the upstream Supabase session on every OAuth
 * token refresh and persists it to the grant), and our access-token TTL is set
 * below Supabase's expiry — so by the time a tool runs, the token is valid.
 */
async function authedFetch(holder: TokenHolder, path: string, init: RequestInit): Promise<Response> {
	const { env, props } = holder;
	return fetch(`${env.SUPABASE_URL}${path}`, {
		...init,
		headers: {
			...(init.headers as Record<string, string> | undefined),
			apikey: env.SUPABASE_ANON_KEY,
			Authorization: `Bearer ${props.supabaseAccessToken ?? ""}`,
			"content-type": "application/json",
		},
	});
}

async function postRows<T>(holder: TokenHolder, table: string, rows: unknown): Promise<T> {
	const res = await authedFetch(holder, `/rest/v1/${table}`, {
		method: "POST",
		headers: { Prefer: "return=representation" },
		body: JSON.stringify(rows),
	});
	if (!res.ok) throw new Error(`insert ${table} ${res.status}: ${await res.text()}`);
	return (await res.json()) as T;
}

async function getRows<T>(holder: TokenHolder, query: string): Promise<T> {
	const res = await authedFetch(holder, `/rest/v1/${query}`, { method: "GET" });
	if (!res.ok) throw new Error(`select ${query} ${res.status}: ${await res.text()}`);
	return (await res.json()) as T;
}

// ── Submissions (community_submissions → existing ingestion pipeline) ────────

const ENTITY_TO_CONTENT_TYPE: Record<string, string> = {
	venue: "venue",
	event: "event",
	stay: "stay",
	place: "venue",
};

export interface SubmissionInput {
	entity_type: "venue" | "event" | "stay" | "place";
	raw_data: Record<string, unknown>;
	source_url: string;
	notes?: string;
}

/**
 * Insert into community_submissions (the canonical user-submission table). The
 * `source-community-submissions` edge function promotes pending rows into
 * ingestion_staging → normalize → dedupe → quality → review-gate → commit.
 * RLS policy "Users can create submissions" requires submitted_by = auth.uid().
 */
export async function insertSubmission(
	holder: TokenHolder,
	userId: string,
	input: SubmissionInput,
): Promise<{ id: string; status: string }> {
	const images = Array.isArray((input.raw_data as { images?: unknown }).images)
		? ((input.raw_data as { images: unknown[] }).images.filter((x) => typeof x === "string") as string[])
		: [];
	const row = {
		content_type: ENTITY_TO_CONTENT_TYPE[input.entity_type] ?? "venue",
		status: "pending",
		feedback_status: "new",
		data: input.raw_data,
		submitted_by: userId,
		source_url: input.source_url,
		media_urls: images.length ? images : null,
		media_processing_status: images.length ? "pending" : "not_applicable",
		sub_source_type: "api",
		platform: "manual",
		submitter_metadata: { client: "mcp", user_notes: input.notes ?? null },
	};
	const [inserted] = await postRows<Array<{ id: string; status: string }>>(holder, "community_submissions", [row]);
	return inserted;
}

// ── Favorites ───────────────────────────────────────────────────────────────

const FAVORITE_TABLE: Record<string, { table: string; col: string }> = {
	venue: { table: "venue_favorites", col: "venue_id" },
	event: { table: "event_favorites", col: "event_id" },
	marketplace: { table: "marketplace_favorites", col: "listing_id" },
	news: { table: "news_favorites", col: "article_id" },
};

export function favoriteTableFor(entityType: string): { table: string; col: string } | null {
	return FAVORITE_TABLE[entityType] ?? null;
}

export async function saveFavorite(
	holder: TokenHolder,
	userId: string,
	entityType: string,
	entityId: string,
): Promise<{ id: string }> {
	const map = favoriteTableFor(entityType);
	if (!map) throw new Error(`favorites not supported for type "${entityType}"`);
	const [row] = await postRows<Array<{ id: string }>>(holder, map.table, [
		{ user_id: userId, [map.col]: entityId },
	]);
	return row;
}

export async function listFavorites(holder: TokenHolder, entityType: string): Promise<unknown[]> {
	const map = favoriteTableFor(entityType);
	if (!map) throw new Error(`favorites not supported for type "${entityType}"`);
	return getRows<unknown[]>(holder, `${map.table}?select=*&order=created_at.desc&limit=200`);
}

// ── Trips ────────────────────────────────────────────────────────────────────

export interface CreateTripInput {
	title: string;
	primary_city_id: string;
	description?: string;
	start_date?: string;
	end_date?: string;
}

export async function createTrip(
	holder: TokenHolder,
	userId: string,
	input: CreateTripInput,
): Promise<{ id: string; title: string }> {
	const [row] = await postRows<Array<{ id: string; title: string }>>(holder, "trips", [
		{
			owner_id: userId,
			title: input.title,
			description: input.description ?? null,
			primary_city_id: input.primary_city_id,
			start_date: input.start_date ?? null,
			end_date: input.end_date ?? null,
		},
	]);
	return row;
}

export async function listTrips(holder: TokenHolder): Promise<unknown[]> {
	return getRows<unknown[]>(
		holder,
		"trips?select=id,title,status,start_date,end_date,primary_city_name,primary_country_code&order=updated_at.desc&limit=100",
	);
}

export interface AddTripPlaceInput {
	trip_id: string;
	entity_type: "venue" | "event" | "hotel";
	entity_id: string;
	notes?: string;
}

export async function addTripPlace(
	holder: TokenHolder,
	userId: string,
	input: AddTripPlaceInput,
): Promise<{ id: string }> {
	const idCol =
		input.entity_type === "venue" ? "venue_id" : input.entity_type === "event" ? "event_id" : "hotel_id";
	const [row] = await postRows<Array<{ id: string }>>(holder, "trip_places", [
		{ trip_id: input.trip_id, [idCol]: input.entity_id, notes: input.notes ?? null, created_by: userId },
	]);
	return row;
}

// ── GoTrue (email OTP login + token refresh) ─────────────────────────────────

interface Session {
	access_token: string;
	refresh_token: string;
	user?: { id: string; email?: string };
}

export async function sendOtp(env: Env, email: string): Promise<void> {
	const res = await fetch(`${env.SUPABASE_URL}/auth/v1/otp`, {
		method: "POST",
		headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
		// should_create_user=false: MCP login is for existing accounts only.
		body: JSON.stringify({ email, should_create_user: false }),
	});
	if (!res.ok) throw new Error(`otp ${res.status}: ${await res.text()}`);
}

export async function verifyOtp(env: Env, email: string, token: string): Promise<Session> {
	const res = await fetch(`${env.SUPABASE_URL}/auth/v1/verify`, {
		method: "POST",
		headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
		body: JSON.stringify({ type: "email", email, token }),
	});
	if (!res.ok) throw new Error(`verify ${res.status}: ${await res.text()}`);
	return (await res.json()) as Session;
}

export async function refreshSession(env: Env, refreshToken: string): Promise<Session | null> {
	try {
		const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
			method: "POST",
			headers: { apikey: env.SUPABASE_ANON_KEY, "content-type": "application/json" },
			body: JSON.stringify({ refresh_token: refreshToken }),
		});
		if (!res.ok) return null;
		return (await res.json()) as Session;
	} catch {
		return null;
	}
}
