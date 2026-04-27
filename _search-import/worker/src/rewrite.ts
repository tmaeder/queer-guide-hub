/**
 * Query rewriter using Workers AI llama-3.2-3b.
 * - Expands synonyms (schwul → gay/queer)
 * - Translates non-EN to EN for better embed lookup (until bge-m3 migration)
 * - Extracts intent filters (city, type) the user typed naturally
 *
 * Cached in EMBED_CACHE to avoid repeat cost.
 */

import type { Env } from "./index";

const MODEL = "@cf/meta/llama-3.2-3b-instruct";

const SYS = `You are a search query rewriter for queer.guide (LGBTQ+ travel + venues + events).
Given a user query in any language, output ONE compact JSON object (no prose) with fields:
  q_en       : the query translated to English, lowercased, keywords only (≤8 words)
  synonyms   : array of up to 4 closely-related EN terms (e.g. "bar","club","pub")
  city       : city name if mentioned, else null
  type_hint  : one of "venue","event","city","personality","news",null
Return ONLY the JSON. No markdown. No explanation.`;

export async function rewriteQuery(
	env: Env,
	query: string,
	lang: string,
): Promise<{ q_en: string; synonyms: string[]; city: string | null; type_hint: string | null } | null> {
	if (!query || query.length > 120) return null;
	const cacheKey = `rw:${lang}:${query.trim().toLowerCase()}`;

	const cached = await env.EMBED_CACHE.get(cacheKey, { type: "json" });
	if (cached) return cached as any;

	const gateway = env.AI_GATEWAY_NAME ? { id: env.AI_GATEWAY_NAME, cacheTtl: 86400 * 7 } : undefined;
	let res: any;
	try {
		res = await env.AI.run(
			MODEL as any,
			{
				messages: [
					{ role: "system", content: SYS },
					{ role: "user", content: `Query (lang=${lang}): ${query}` },
				],
				max_tokens: 120,
				temperature: 0.1,
			} as any,
			gateway ? { gateway } : undefined,
		);
	} catch (e) {
		console.warn("rewrite failed", e);
		return null;
	}

	const text: string = res?.response ?? "";
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	let parsed: any;
	try {
		parsed = JSON.parse(match[0]);
	} catch {
		return null;
	}

	const out = {
		q_en: String(parsed.q_en || "").toLowerCase().slice(0, 100),
		synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms.slice(0, 4).map((s: any) => String(s).toLowerCase()) : [],
		city: parsed.city ? String(parsed.city).toLowerCase() : null,
		type_hint: parsed.type_hint ?? null,
	};
	try {
		await env.EMBED_CACHE.put(cacheKey, JSON.stringify(out), { expirationTtl: 86400 * 30 });
	} catch {
		/* KV quota — skip cache */
	}
	return out;
}
