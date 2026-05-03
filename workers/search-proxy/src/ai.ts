/**
 * Workers AI + AI Gateway client.
 * - Embedding cached in KV by sha256(text).
 * - Reranker: @cf/baai/bge-reranker-base (takes query + contexts, returns scored indexes).
 */

import type { Env } from "./index";
import { sha256 } from "./util";

export const DEFAULT_EMBED_MODEL = "@cf/baai/bge-m3"; // 1024-dim, multilingual (EN/DE/ES/FR/...)
const EMBED_TIMEOUT_MS = 5000;
const EMBED_DIM = 1024;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
		p.then(
			(v) => {
				clearTimeout(t);
				resolve(v);
			},
			(e) => {
				clearTimeout(t);
				reject(e);
			},
		);
	});
}

export async function embed(
	env: Env,
	text: string,
	opts?: { cacheKey?: string; model?: string },
): Promise<number[]> {
	const model = opts?.model || env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
	const cacheKey = `emb:${model}:${await sha256(text)}`;

	const cached = await env.EMBED_CACHE.get(cacheKey, { type: "json" }).catch(() => null);
	if (cached && Array.isArray(cached)) return cached as number[];

	const gateway = env.AI_GATEWAY_NAME
		? { id: env.AI_GATEWAY_NAME, cacheTtl: 60 * 60 * 24 * 7 }
		: undefined;

	let res: unknown;
	try {
		res = await withTimeout(
			env.AI.run(
				model as Parameters<typeof env.AI.run>[0],
				{ text: [text] } as Parameters<typeof env.AI.run>[1],
				gateway ? { gateway } : undefined,
			) as Promise<unknown>,
			EMBED_TIMEOUT_MS,
			"embed",
		);
	} catch (e) {
		// Fail-soft: return a zero vector so semanticSearch returns nothing
		// useful but the rest of /search still completes within budget.
		// Bug observed 2026-05-03 when AI Gateway stalled.
		console.warn("embed timeout/error:", (e as Error).message);
		return new Array(EMBED_DIM).fill(0);
	}

	const candidate =
		(res as { data?: unknown })?.data ??
		(res as { [n: number]: unknown })?.[0];
	const vec: number[] = Array.isArray(candidate) && Array.isArray(candidate[0])
		? (candidate[0] as number[])
		: (candidate as number[]);
	if (!Array.isArray(vec)) throw new Error("embed: no vector");
	// Cache 30 days — best-effort, KV quota may be exhausted.
	try {
		await env.EMBED_CACHE.put(cacheKey, JSON.stringify(vec), { expirationTtl: 60 * 60 * 24 * 30 });
	} catch (e) {
		console.warn("EMBED_CACHE put failed", (e as Error)?.message);
	}
	return vec;
}

export async function rerank(
	env: Env,
	query: string,
	contexts: string[],
): Promise<{ index: number; score: number }[]> {
	if (!contexts.length) return [];
	const gateway = env.AI_GATEWAY_NAME ? { id: env.AI_GATEWAY_NAME } : undefined;
	const res = (await env.AI.run(
		"@cf/baai/bge-reranker-base" as Parameters<typeof env.AI.run>[0],
		{ query, contexts: contexts.map((text) => ({ text })), top_n: contexts.length } as Parameters<typeof env.AI.run>[1],
		gateway ? { gateway } : undefined,
	)) as { response?: Array<{ id?: number; index?: number; score?: number }>; data?: Array<{ id?: number; index?: number; score?: number }> };
	const ranked = res?.response ?? res?.data ?? [];
	return ranked.map((r) => ({ index: (r.id ?? r.index) as number, score: r.score ?? 0 }));
}
