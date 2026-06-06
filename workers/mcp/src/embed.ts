/**
 * Query embedding for the search_hybrid vector leg — @cf/baai/bge-m3 (1024-dim,
 * multilingual) via the AI binding, the SAME model the corpus is embedded with,
 * so the query vector lands in the same space as search_documents.embedding.
 * Returns a pgvector literal ("[f,f,…]") for PostgREST, or null on any failure
 * so the caller falls back to the keyword-only leg (search never breaks on an
 * embedding hiccup).
 *
 * Mirrors workers/assistant/src/embed.ts.
 */

import type { Env } from "./types";

const EMBED_MODEL = "@cf/baai/bge-m3";
const EMBED_TIMEOUT_MS = 4000;

export async function embedQuery(env: Env, text: string): Promise<string | null> {
	const q = text.trim();
	if (!q) return null;
	const gateway = env.AI_GATEWAY_NAME ? { id: env.AI_GATEWAY_NAME, cacheTtl: 60 * 60 * 24 * 7 } : undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const run = env.AI.run(
			EMBED_MODEL as Parameters<typeof env.AI.run>[0],
			{ text: [q] } as Parameters<typeof env.AI.run>[1],
			gateway ? { gateway } : undefined,
		) as Promise<unknown>;
		const res = await Promise.race([
			run,
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), EMBED_TIMEOUT_MS);
			}),
		]);
		if (!res) return null;
		const candidate = (res as { data?: unknown })?.data ?? (res as Record<number, unknown>)?.[0];
		const vec =
			Array.isArray(candidate) && Array.isArray(candidate[0]) ? (candidate[0] as number[]) : (candidate as number[]);
		if (!Array.isArray(vec) || vec.length === 0) return null;
		return `[${vec.join(",")}]`;
	} catch (e) {
		console.warn("embedQuery", (e as Error).message);
		return null;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

// ── AutoRAG (Cloudflare AI Search) over published queer.guide content ────────
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

export async function knowledgeSearch(
	env: Env,
	query: string,
): Promise<Array<{ source: string; score?: number; text: string }>> {
	if (!query.trim()) return [];
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
		console.warn("knowledgeSearch (autorag) failed:", (e as Error).message);
		return [];
	}
}
