/**
 * Assistant tools — thin wrappers over the search_documents Postgres RPCs
 * (search_hybrid / get_recommendations / related_entities). These are the ONLY
 * way the model can reach real entities, which is how grounding is enforced:
 * the cards the UI renders come from tool results, never from model prose.
 *
 * search_entities runs the full hybrid path: the query is embedded with bge-m3
 * (same model/space as the corpus) and passed to search_hybrid so SQL fuses the
 * keyword + vector legs via RRF. Embedding is fail-soft — on any hiccup it falls
 * back to the keyword-only leg.
 */

import type { Env, ToolDef, Card } from "./types";
import { embedQuery } from "./embed";

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
			"Hybrid (keyword + semantic) search across the queer.guide corpus (venues, events, cities, people, news, marketplace, tags, queer villages). Use for 'find / where / what is' questions. Returns real entity cards.",
		parameters: {
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
		parameters: {
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
		parameters: {
			type: "object",
			properties: {
				entity_type: { type: "string", enum: ENTITY_TYPES },
				entity_id: { type: "string", description: "UUID of the seed entity." },
				limit: { type: "integer", minimum: 1, maximum: 20 },
			},
			required: ["entity_type", "entity_id"],
		},
	},
	{
		name: "knowledge_search",
		description:
			"Search queer.guide's published guides, articles, city/country pages and editorial content for background, advice, safety, and 'how / why / tell me about' questions. Returns text passages with their source URLs so the answer is grounded and citable. Use this for informational questions; use search_entities to find a specific venue/event/person.",
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Natural-language question, e.g. 'is it safe to travel to Qatar as a gay couple'.",
				},
			},
			required: ["query"],
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
			const query = String(input.query ?? "");
			// Embed the query (bge-m3, corpus-matched) so search_hybrid fuses the
			// keyword + vector legs; null on failure → keyword-only fallback.
			const p_query_vec = await embedQuery(env, query);
			const rows = await rpc<{ hits?: unknown }>(env, "search_hybrid", {
				p_query: query,
				p_query_vec,
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
		} else if (name === "knowledge_search") {
			// RAG over published queer.guide content via Cloudflare AutoRAG. Returns
			// text passages + source URLs (not entity cards) for prose/advice answers.
			const passages = await autoragSearch(env, String(input.query ?? ""));
			return { content: JSON.stringify({ passages }), cards: [] };
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

// ── AutoRAG (Cloudflare AI Search) ─────────────────────────────────────────
// Queries the `queerguide` instance (web crawl of queer.guide). We use search()
// — raw passages — not aiSearch(), so the assistant's own model synthesizes the
// answer (single generation, consistent grounding). Fail-soft: any error/timeout
// returns [] so the tool never breaks the turn. The AI binding's autorag() method
// isn't in the shipped types, so reach it through a minimal structural type.
const AUTORAG_INSTANCE = "queerguide";
const AUTORAG_TIMEOUT_MS = 6000;

interface AutoragChunk {
	filename?: string;
	score?: number;
	content?: Array<{ text?: string }> | string;
}
interface AutoragBinding {
	search(opts: { query: string; max_num_results?: number }): Promise<{ data?: AutoragChunk[] }>;
}

function chunkText(content: AutoragChunk["content"]): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map((c) => c?.text ?? "").join(" ").trim();
	return "";
}

async function autoragSearch(
	env: Env,
	query: string,
): Promise<Array<{ source: string; score?: number; text: string }>> {
	if (!query) return [];
	try {
		const ai = env.AI as unknown as { autorag: (id: string) => AutoragBinding };
		const result = await Promise.race([
			ai.autorag(AUTORAG_INSTANCE).search({ query, max_num_results: 6 }),
			new Promise<{ data?: AutoragChunk[] }>((_, reject) =>
				setTimeout(() => reject(new Error("autorag-timeout")), AUTORAG_TIMEOUT_MS),
			),
		]);
		const data = Array.isArray(result?.data) ? result.data : [];
		return data
			.slice(0, 6)
			.map((d) => ({ source: d.filename ?? "", score: d.score, text: chunkText(d.content).slice(0, 1200) }))
			.filter((p) => p.text);
	} catch (e) {
		console.warn("knowledge_search (autorag) failed:", (e as Error).message);
		return [];
	}
}
