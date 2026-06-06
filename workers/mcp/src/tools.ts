/**
 * MCP tool definitions. Read tools wrap the public discovery RPCs (service
 * key); write tools require a Supabase user JWT carried in `agent.props` and go
 * through RLS. All tools are registered on every mount — on the public
 * (unauthenticated) endpoint the write tools simply report that the user must
 * connect through the authenticated endpoint.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env, Props } from "./types";
import { ENTITY_TYPES } from "./types";
import { embedQuery, knowledgeSearch } from "./embed";
import {
	rpc,
	insertSubmission,
	saveFavorite,
	listFavorites,
	createTrip,
	listTrips,
	addTripPlace,
	type TokenHolder,
} from "./supabase";

export interface Agent {
	server: McpServer;
	env: Env;
	props: Props;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true });

const AUTH_HINT =
	"This tool needs a signed-in queer.guide account. Connect using the authenticated MCP endpoint (OAuth) — your client will prompt you to sign in with your queer.guide email.";

function requireUser(agent: Agent): { userId: string; holder: TokenHolder } | null {
	const userId = agent.props?.userId;
	const token = agent.props?.supabaseAccessToken;
	if (!userId || !token) return null;
	return { userId, holder: { env: agent.env, props: agent.props } };
}

function clampLimit(v: number | undefined, dflt: number, max = 50): number {
	if (typeof v !== "number" || !Number.isFinite(v)) return dflt;
	return Math.max(1, Math.min(max, Math.floor(v)));
}

export function registerTools(agent: Agent): void {
	const { server, env } = agent;

	// ── Read: search ──────────────────────────────────────────────────────────
	server.tool(
		"search",
		"Hybrid (keyword + semantic) search across the queer.guide corpus: LGBTQ+ venues, events, cities, countries, people, news, marketplace listings, tags and queer villages. Use for 'find / where / what is' questions. Returns entity cards with objectID (pass to get_entity or find_related), trust_score and liveness_status.",
		{
			query: z.string().describe("Search query, e.g. 'wheelchair accessible gay bar in Berlin'."),
			types: z.array(z.enum(ENTITY_TYPES)).optional().describe("Restrict to these entity types."),
			city: z.string().optional().describe("Restrict to a city by name."),
			lat: z.number().optional().describe("Latitude for geo-ranked results."),
			lng: z.number().optional().describe("Longitude for geo-ranked results."),
			radius_km: z.number().optional().describe("Radius in km around lat/lng."),
			limit: z.number().int().optional().describe("Max results (1-50, default 10)."),
		},
		async ({ query, types, city, lat, lng, radius_km, limit }): Promise<ToolResult> => {
			try {
				const filters: Record<string, unknown> = {};
				if (city) filters.city = city;
				const p_query_vec = await embedQuery(env, query);
				const rows = await rpc<{ hits?: unknown[] }>(env, "search_hybrid", {
					p_query: query,
					p_query_vec,
					p_content_types: types?.length ? types : null,
					p_filters: filters,
					p_lat: lat ?? null,
					p_lng: lng ?? null,
					p_radius_km: radius_km ?? null,
					p_limit: clampLimit(limit, 10),
				});
				return ok({ hits: rows?.hits ?? [] });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Read: autocomplete ──────────────────────────────────────────────────────
	server.tool(
		"autocomplete",
		"Fast prefix/typeahead suggestions across the corpus. Use to resolve a partial name to real entities before a detailed lookup.",
		{
			prefix: z.string().describe("Partial text the user has typed."),
			types: z.array(z.enum(ENTITY_TYPES)).optional(),
			limit: z.number().int().optional().describe("Max suggestions (1-20, default 8)."),
		},
		async ({ prefix, types, limit }): Promise<ToolResult> => {
			try {
				const rows = await rpc<unknown>(env, "search_autocomplete", {
					p_prefix: prefix,
					p_content_types: types?.length ? types : null,
					p_limit: clampLimit(limit, 8, 20),
				});
				return ok({ suggestions: rows });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Read: entity detail ─────────────────────────────────────────────────────
	server.tool(
		"get_entity",
		"Fetch the full record for one entity by type + id (objectID from search) or type + slug. Includes full description, geo, tags, trust_score, liveness_status and closure status — use liveness_status / closed_at to warn the user about stale, closed or unverified places.",
		{
			type: z.enum(ENTITY_TYPES),
			id: z.string().uuid().optional().describe("Entity UUID (objectID from search)."),
			slug: z.string().optional().describe("Entity slug (alternative to id)."),
		},
		async ({ type, id, slug }): Promise<ToolResult> => {
			if (!id && !slug) return fail("provide either id or slug");
			try {
				const row = await rpc<unknown>(env, "get_entity_detail", {
					p_type: type,
					p_id: id ?? null,
					p_slug: slug ?? null,
				});
				if (!row) return fail("not_found");
				return ok({ entity: row });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Read: related ───────────────────────────────────────────────────────────
	server.tool(
		"find_related",
		"Find entities similar/related to a known entity (more like this venue, event, person, etc.). Returns entity cards.",
		{
			entity_type: z.enum(ENTITY_TYPES),
			entity_id: z.string().uuid().describe("UUID of the seed entity (objectID from search)."),
			types: z.array(z.enum(ENTITY_TYPES)).optional().describe("Restrict results to these types."),
			limit: z.number().int().optional().describe("Max results (1-50, default 10)."),
		},
		async ({ entity_type, entity_id, types, limit }): Promise<ToolResult> => {
			try {
				const rows = await rpc<unknown>(env, "related_entities", {
					p_entity_type: entity_type,
					p_entity_id: entity_id,
					p_content_types: types?.length ? types : null,
					p_limit: clampLimit(limit, 10),
				});
				return ok({ related: rows });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Read: recommendations ───────────────────────────────────────────────────
	server.tool(
		"recommendations",
		"Popularity-aware discovery feed for when there is no specific query (e.g. 'what's good in Berlin', 'anything worth seeing'). Returns entity cards.",
		{
			types: z.array(z.enum(ENTITY_TYPES)).optional(),
			city: z.string().optional(),
			lat: z.number().optional(),
			lng: z.number().optional(),
			radius_km: z.number().optional(),
			limit: z.number().int().optional().describe("Max results (1-50, default 12)."),
		},
		async ({ types, city, lat, lng, radius_km, limit }): Promise<ToolResult> => {
			try {
				const rows = await rpc<unknown>(env, "get_recommendations", {
					p_bias_vec: null,
					p_content_types: types?.length ? types : null,
					p_city: city ?? null,
					p_lat: lat ?? null,
					p_lng: lng ?? null,
					p_radius_km: radius_km ?? null,
					p_limit: clampLimit(limit, 12),
				});
				return ok({ recommendations: rows });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Read: events in window ──────────────────────────────────────────────────
	server.tool(
		"events_in_window",
		"List events happening between two timestamps, optionally filtered by city or country. Use for 'what's on this weekend in Lisbon' style questions.",
		{
			start: z.string().describe("Window start (ISO 8601 timestamp)."),
			end: z.string().describe("Window end (ISO 8601 timestamp)."),
			city: z.string().optional(),
			country: z.string().optional().describe("Country name or code."),
			limit: z.number().int().optional().describe("Max events (1-50, default 50)."),
		},
		async ({ start, end, city, country, limit }): Promise<ToolResult> => {
			try {
				const rows = await rpc<unknown>(env, "events_in_window", {
					p_start: start,
					p_end: end,
					p_city: city ?? null,
					p_country: country ?? null,
					p_limit: clampLimit(limit, 50),
				});
				return ok({ events: rows });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Read: on this day ───────────────────────────────────────────────────────
	server.tool(
		"on_this_day",
		"LGBTQ+ personalities connected to a given calendar day (born/died/notable). Defaults to today. Returns people cards.",
		{
			date: z.string().optional().describe("ISO date (YYYY-MM-DD); defaults to today."),
			limit: z.number().int().optional().describe("Max people (1-50, default 12)."),
		},
		async ({ date, limit }): Promise<ToolResult> => {
			try {
				const rows = await rpc<unknown>(env, "personalities_on_this_day", {
					...(date ? { p_today: date } : {}),
					p_limit: clampLimit(limit, 12),
				});
				return ok({ people: rows });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Read: knowledge (AutoRAG) ───────────────────────────────────────────────
	server.tool(
		"knowledge",
		"Search queer.guide's published guides, city/country pages and editorial content for background, advice and safety ('is it safe to travel to … as a gay couple', 'tell me about …'). Returns text passages with their source URLs so answers stay grounded and citable. Use search/get_entity for specific places; use this for prose and safety guidance.",
		{ query: z.string().describe("Natural-language question.") },
		async ({ query }): Promise<ToolResult> => {
			try {
				const passages = await knowledgeSearch(env, query);
				return ok({ passages });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Write: submit place ─────────────────────────────────────────────────────
	server.tool(
		"submit_place",
		"Submit a new LGBTQ+ venue (bar, club, café, sauna, community space, hotel, etc.) for review. Goes into the moderation + dedupe pipeline; it is NOT published immediately. Requires sign-in.",
		{
			name: z.string().describe("Venue name."),
			source_url: z.string().url().describe("URL the information came from (official site / listing)."),
			description: z.string().optional(),
			address: z.string().optional(),
			city: z.string().optional(),
			country: z.string().optional().describe("ISO-2 country code preferred."),
			latitude: z.number().optional(),
			longitude: z.number().optional(),
			tags: z.array(z.string()).optional(),
			images: z.array(z.string().url()).optional(),
			notes: z.string().max(2000).optional().describe("Anything the reviewer should know."),
		},
		async (args): Promise<ToolResult> => {
			const auth = requireUser(agent);
			if (!auth) return fail(AUTH_HINT);
			try {
				const { source_url, notes, ...raw } = args;
				const result = await insertSubmission(auth.holder, auth.userId, {
					entity_type: "venue",
					source_url,
					notes,
					raw_data: raw,
				});
				return ok({ submission_id: result.id, status: result.status, note: "Queued for review — not yet public." });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Write: submit event ─────────────────────────────────────────────────────
	server.tool(
		"submit_event",
		"Submit a new LGBTQ+ event (party, pride, festival, meetup, screening, etc.) for review. Goes into the moderation + dedupe pipeline; not published immediately. Requires sign-in.",
		{
			title: z.string().describe("Event title."),
			source_url: z.string().url().describe("URL the information came from."),
			description: z.string().optional(),
			start_date: z.string().optional().describe("ISO 8601 start."),
			end_date: z.string().optional().describe("ISO 8601 end."),
			city: z.string().optional(),
			country: z.string().optional(),
			latitude: z.number().optional(),
			longitude: z.number().optional(),
			tags: z.array(z.string()).optional(),
			images: z.array(z.string().url()).optional(),
			notes: z.string().max(2000).optional(),
		},
		async (args): Promise<ToolResult> => {
			const auth = requireUser(agent);
			if (!auth) return fail(AUTH_HINT);
			try {
				const { source_url, notes, ...raw } = args;
				const result = await insertSubmission(auth.holder, auth.userId, {
					entity_type: "event",
					source_url,
					notes,
					raw_data: raw,
				});
				return ok({ submission_id: result.id, status: result.status, note: "Queued for review — not yet public." });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Write: favorites ─────────────────────────────────────────────────────────
	server.tool(
		"save_favorite",
		"Save an entity to the signed-in user's favorites. Supported types: venue, event, marketplace, news. Requires sign-in.",
		{
			entity_type: z.enum(["venue", "event", "marketplace", "news"]),
			entity_id: z.string().uuid().describe("Entity UUID (objectID from search)."),
		},
		async ({ entity_type, entity_id }): Promise<ToolResult> => {
			const auth = requireUser(agent);
			if (!auth) return fail(AUTH_HINT);
			try {
				const row = await saveFavorite(auth.holder, auth.userId, entity_type, entity_id);
				return ok({ favorite_id: row.id, saved: true });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	server.tool(
		"list_favorites",
		"List the signed-in user's saved favorites for a given type. Requires sign-in.",
		{ entity_type: z.enum(["venue", "event", "marketplace", "news"]) },
		async ({ entity_type }): Promise<ToolResult> => {
			const auth = requireUser(agent);
			if (!auth) return fail(AUTH_HINT);
			try {
				return ok({ favorites: await listFavorites(auth.holder, entity_type) });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	// ── Write: trips ─────────────────────────────────────────────────────────────
	server.tool(
		"create_trip",
		"Create a new trip for the signed-in user. primary_city_id is required — resolve it first with search(types:['city']) and use the city's objectID. Requires sign-in.",
		{
			title: z.string().describe("Trip title."),
			primary_city_id: z.string().uuid().describe("City UUID (objectID of a city from search)."),
			description: z.string().optional(),
			start_date: z.string().optional().describe("ISO date (YYYY-MM-DD)."),
			end_date: z.string().optional().describe("ISO date (YYYY-MM-DD)."),
		},
		async (args): Promise<ToolResult> => {
			const auth = requireUser(agent);
			if (!auth) return fail(AUTH_HINT);
			try {
				const trip = await createTrip(auth.holder, auth.userId, args);
				return ok({ trip_id: trip.id, title: trip.title });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	server.tool(
		"list_my_trips",
		"List the signed-in user's trips. Requires sign-in.",
		{},
		async (): Promise<ToolResult> => {
			const auth = requireUser(agent);
			if (!auth) return fail(AUTH_HINT);
			try {
				return ok({ trips: await listTrips(auth.holder) });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);

	server.tool(
		"add_to_trip",
		"Add a venue, event or hotel to an existing trip. Requires sign-in.",
		{
			trip_id: z.string().uuid(),
			entity_type: z.enum(["venue", "event", "hotel"]),
			entity_id: z.string().uuid().describe("Entity UUID (objectID from search)."),
			notes: z.string().optional(),
		},
		async (args): Promise<ToolResult> => {
			const auth = requireUser(agent);
			if (!auth) return fail(AUTH_HINT);
			try {
				const row = await addTripPlace(auth.holder, auth.userId, args);
				return ok({ trip_place_id: row.id, added: true });
			} catch (e) {
				return fail((e as Error).message);
			}
		},
	);
}
