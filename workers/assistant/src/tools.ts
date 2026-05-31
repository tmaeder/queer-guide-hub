/**
 * Assistant tools — thin wrappers over the search_documents Postgres RPCs
 * (search_hybrid / get_recommendations / related_entities). These are the ONLY
 * way the model can reach real entities, which is how grounding is enforced:
 * the cards the UI renders come from tool results, never from model prose.
 *
 * Skeleton note: search uses the keyword leg only (p_query_vec = null). Semantic
 * blending would require an embedding round-trip (Workers AI) — a follow-up.
 */

import type { Env, ToolDef, Card } from "./types";

const RPC_TIMEOUT_MS = 6000;

async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("rpc-timeout"), RPC_TIMEOUT_MS);
	try {
		const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
			method: "POST",
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
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

const ENTITY_TYPES = ["venue", "event", "city", "country", "news", "marketplace", "personality", "tag", "queer_village"];

export const TOOLS: ToolDef[] = [
	{
		name: "search_entities",
		description:
			"Keyword search across the queer.guide corpus (venues, events, cities, people, news, marketplace, tags, queer villages). Use for 'find / where / what is' questions. Returns real entity cards.",
		input_schema: {
			type: "object",
			properties: {
				query: { type: "string", description: "Search query, e.g. 'wheelchair accessible gay bar'." },
				types: { type: "array", items: { type: "string", enum: ENTITY_TYPES }, description: "Restrict to these entity types." },
				city: { type: "string", description: "Restrict to a city by name." },
				limit: { type: "integer", description: "Max results (default 8).", minimum: 1, maximum: 20 },
			},
			required: ["query"],
		},
	},
	{
		name: "get_recommendations",
		description:
			"Personalized, popularity-aware discovery feed for when there is no specific query (e.g. 'what's good in Berlin', 'anything for me'). Returns real entity cards.",
		input_schema: {
			type: "object",
			properties: {
				types: { type: "array", items: { type: "string", enum: ENTITY_TYPES } },
				city: { type: "string" },
				limit: { type: "integer", minimum: 1, maximum: 20 },
			},
		},
	},
	{
		name: "find_related",
		description: "Find entities similar/related to a known entity (a venue, event, person, etc.). Returns real entity cards.",
		input_schema: {
			type: "object",
			properties: {
				entity_type: { type: "string", enum: ENTITY_TYPES },
				entity_id: { type: "string", description: "UUID of the seed entity." },
				limit: { type: "integer", minimum: 1, maximum: 20 },
			},
			required: ["entity_type", "entity_id"],
		},
	},
];

function asCards(rows: unknown): Card[] {
	if (!Array.isArray(rows)) return [];
	return rows
		.map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : null))
		.filter((r): r is Record<string, unknown> => !!r && typeof r.objectID === "string")
		.map((r) => r as Card);
}

/** Compact card view handed back to the model (keep tokens small). */
function forModel(cards: Card[]): Array<Record<string, unknown>> {
	return cards.map((c) => ({
		id: c.objectID,
		type: c.type,
		title: c.title,
		city: c.city,
		country: c.country,
		category: c.category,
	}));
}

export interface ToolOutcome {
	/** JSON string returned to the model as the tool_result content. */
	content: string;
	/** Real entity cards — accumulated for grounding + UI rendering. */
	cards: Card[];
}

export async function executeTool(env: Env, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
	try {
		let cards: Card[] = [];
		if (name === "search_entities") {
			const filters: Record<string, unknown> = {};
			if (typeof input.city === "string" && input.city) filters.city = input.city;
			const rows = await rpc<{ hits?: unknown }>(env, "search_hybrid", {
				p_query: String(input.query ?? ""),
				p_query_vec: null,
				p_content_types: Array.isArray(input.types) && input.types.length ? input.types : null,
				p_filters: filters,
				p_limit: clampLimit(input.limit, 8),
			});
			cards = asCards(rows?.hits);
		} else if (name === "get_recommendations") {
			const rows = await rpc<unknown>(env, "get_recommendations", {
				p_bias_vec: null,
				p_content_types: Array.isArray(input.types) && input.types.length ? input.types : null,
				p_city: typeof input.city === "string" ? input.city : null,
				p_limit: clampLimit(input.limit, 8),
			});
			cards = asCards(rows);
		} else if (name === "find_related") {
			const rows = await rpc<unknown>(env, "related_entities", {
				p_entity_type: String(input.entity_type ?? ""),
				p_entity_id: String(input.entity_id ?? ""),
				p_limit: clampLimit(input.limit, 8),
			});
			cards = asCards(rows);
		} else {
			return { content: JSON.stringify({ error: `unknown tool: ${name}` }), cards: [] };
		}
		return { content: JSON.stringify({ results: forModel(cards) }), cards };
	} catch (e) {
		return { content: JSON.stringify({ error: (e as Error).message }), cards: [] };
	}
}

function clampLimit(v: unknown, dflt: number): number {
	const n = typeof v === "number" ? Math.floor(v) : dflt;
	return Math.max(1, Math.min(20, n));
}
