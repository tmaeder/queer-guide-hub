/**
 * Hierarchical tag-filter expansion for search.
 *
 * When a user filters by a tag, we widen the filter to include that tag's
 * narrower descendants from the governed ontology (tag_relations `broader`
 * edges) — e.g. filtering by "health" also surfaces "mental-health" and
 * "depression". This is the search payoff of the P2 taxonomy graph.
 *
 * Done here in the worker (already the query/synonym-expansion layer) rather
 * than in search_hybrid, so the ranking RPC is untouched. The DB RPC returns
 * the original slugs PLUS descendants and NEVER drops an input, so this only
 * widens recall. KV-cached (1h; the hierarchy is rebuilt weekly) and fail-open:
 * any error returns the original tags unchanged.
 */

import type { Env } from "./index";

const KV_PREFIX = "tagexp:v1:";
const KV_TTL_SECONDS = 3600; // 1 hour

export async function expandTagsWithNarrower(
	env: Env,
	tags: string[] | undefined,
): Promise<string[] | undefined> {
	if (!tags || tags.length === 0) return tags;

	const key = KV_PREFIX + [...tags].sort().join(",");
	try {
		const cached = await env.SESSION_CACHE.get(key, "json");
		if (cached && Array.isArray(cached)) return cached as string[];
	} catch {
		// KV transient — fall through to a fresh fetch.
	}

	let expanded = tags;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort("tagexp-timeout"), 2500);
	try {
		const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/expand_tag_slugs_with_narrower`, {
			method: "POST",
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ p_slugs: tags }),
			signal: controller.signal,
		});
		if (res.ok) {
			const out = (await res.json()) as string[] | null;
			if (Array.isArray(out) && out.length) expanded = out;
		} else {
			console.warn("expandTagsWithNarrower: supabase", res.status);
		}
	} catch (e) {
		console.warn("expandTagsWithNarrower: fetch failed", (e as Error).message);
	} finally {
		clearTimeout(timer);
	}

	try {
		await env.SESSION_CACHE.put(key, JSON.stringify(expanded), {
			expirationTtl: KV_TTL_SECONDS,
		});
	} catch {
		// quota / transient — ignore.
	}
	return expanded;
}
