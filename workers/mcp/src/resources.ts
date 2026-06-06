/**
 * MCP resources — let a client pin a destination as context. Two templates:
 *   queerguide://city/{slug}
 *   queerguide://country/{slug}
 * Each resolves to the full denormalized record (get_entity_detail). The
 * `list` callbacks surface a discoverable set of popular cities/countries; any
 * valid slug works via the template even if not listed.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Agent } from "./tools";
import { rpc } from "./supabase";
import type { Env } from "./types";

interface Card {
	slug?: string;
	title?: string;
	description?: string;
	objectID?: string;
}

async function popular(env: Env, type: "city" | "country"): Promise<Card[]> {
	try {
		const rows = await rpc<Card[]>(env, "get_recommendations", {
			p_bias_vec: null,
			p_content_types: [type],
			p_city: null,
			p_lat: null,
			p_lng: null,
			p_radius_km: null,
			p_limit: 50,
		});
		return Array.isArray(rows) ? rows : [];
	} catch {
		return [];
	}
}

function listFor(env: Env, type: "city" | "country") {
	return async () => {
		const cards = await popular(env, type);
		const resources = cards
			.filter((c) => c.slug)
			.map((c) => ({
				uri: `queerguide://${type}/${c.slug}`,
				name: c.title ?? c.slug!,
				description: typeof c.description === "string" ? c.description.slice(0, 160) : undefined,
				mimeType: "application/json",
			}));
		return { resources };
	};
}

async function readDetail(env: Env, type: "city" | "country", slug: string, uri: string) {
	const row = await rpc<unknown>(env, "get_entity_detail", { p_type: type, p_id: null, p_slug: slug });
	return {
		contents: [
			{
				uri,
				mimeType: "application/json",
				text: JSON.stringify(row ?? { error: "not_found" }),
			},
		],
	};
}

export function registerResources(agent: Agent): void {
	const { server, env } = agent;

	server.resource(
		"city",
		new ResourceTemplate("queerguide://city/{slug}", { list: listFor(env, "city") }),
		async (uri, vars) => readDetail(env, "city", String(vars.slug), uri.href),
	);

	server.resource(
		"country",
		new ResourceTemplate("queerguide://country/{slug}", { list: listFor(env, "country") }),
		async (uri, vars) => readDetail(env, "country", String(vars.slug), uri.href),
	);
}
