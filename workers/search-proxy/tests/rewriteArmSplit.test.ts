import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/index";

/**
 * The LLM query rewrite AUGMENTS the search; it must never REPLACE the query.
 *
 * REGRESSION THIS FILE EXISTS FOR (prod, 2026-09-02)
 *   POST https://search.queer.guide/search {"query":"Heldenbar"}
 *     -> 288 hits, NONE of them Heldenbar, led by `Hero` at 0.130873.
 *   `search_hybrid('hero bar', p_query_vec => null)` on the same corpus
 *     -> led by `Hero` at 0.130873 — the SAME score to six decimals, i.e. the
 *        string the user typed never reached Postgres. `Heldenbar` is German
 *        for "heroes' bar"; llama-3.2-3b translated a venue name.
 *   `search_hybrid('Heldenbar', p_query_vec => null)` -> 23 hits, all Heldenbar,
 *        leader 0.220630. The keyword arm was never weak; it was never asked.
 *
 * The fix splits one `effectiveQ` into two: `keywordQ` (always literal, drives
 * search_hybrid's p_query) and `embedQ` (the translation, drives the vector arm).
 * These tests assert the SPLIT, at the handler boundary, by reading what actually
 * leaves the Worker — the search_hybrid RPC body and the embedding-model call.
 *
 * EVERY test here carries a positive control that the rewrite really ran
 * (`llamaCalls > 0`). Without it a rewrite that silently returned null — a KV
 * miss, a 5s timeout, an unparseable body, all of which rewrite.ts swallows by
 * design — would make `p_query === query` trivially true and the suite would go
 * green on a Worker that had lost the feature entirely.
 */

const LLAMA = "@cf/meta/llama-3.2-3b-instruct";
const EMBED = "@cf/baai/bge-m3";

function kv() {
	const m = new Map<string, string>();
	return {
		get: async (k: string, opts?: unknown) => {
			const v = m.get(k);
			if (v === undefined) return null;
			const asJson = opts === "json" || (typeof opts === "object" && opts !== null && (opts as { type?: string }).type === "json");
			return asJson ? JSON.parse(v) : v;
		},
		put: async (k: string, v: string) => void m.set(k, v),
	} as unknown as KVNamespace;
}

interface Harness {
	res: Response;
	body: Record<string, unknown>;
	/** Parsed p_* args of the search_hybrid RPC call, or null if it never ran. */
	hybridArgs: Record<string, unknown> | null;
	/** `text` arguments handed to the embedding model. */
	embedTexts: string[];
	/** How many times the rewriter model was invoked. */
	llamaCalls: number;
}

/**
 * Drives the real POST /search handler with an in-memory env. Everything the
 * pipeline touches other than search_hybrid fails soft by design, so a benign
 * stub is enough; only the two calls under test are observed.
 */
async function runSearch(
	query: string,
	rewrite: { q_en: string; synonyms?: string[]; city?: string | null; type_hint?: string | null } | null,
	opts: { lang?: string } = {},
): Promise<Harness> {
	const embedTexts: string[] = [];
	let llamaCalls = 0;

	const env = {
		SUPABASE_URL: "https://x.supabase.co",
		SUPABASE_SERVICE_KEY: "k",
		ALLOWED_ORIGINS: "https://queer.guide",
		EMBED_CACHE: kv(),
		SESSION_CACHE: kv(),
		AI: {
			run: async (model: string, input: Record<string, unknown>) => {
				if (model === LLAMA) {
					llamaCalls++;
					return { response: rewrite ? JSON.stringify(rewrite) : "not json at all" };
				}
				if (model === EMBED) {
					const t = input.text as string[] | string;
					embedTexts.push(Array.isArray(t) ? t[0] : t);
					return { data: [[0.1, 0.2, 0.3]] };
				}
				return {};
			},
		},
	} as unknown as Env;

	let hybridArgs: Record<string, unknown> | null = null;
	global.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
		const u = String(url);
		const parseBody = () => (init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {});
		if (u.includes("/rpc/search_hybrid")) {
			hybridArgs = parseBody();
			return {
				ok: true,
				json: async () => ({ total: 1, hits: [{ objectID: "e1", type: "event", title: "Heldenbar", _rankingScore: 0.22 }] }),
			} as unknown as Response;
		}
		if (u.includes("/rpc/search_facets")) return { ok: true, json: async () => ({}) } as unknown as Response;
		// search_synonyms, get_bias_signal, get_user_signal, popular entities,
		// log_search — all fail-open paths; an empty array satisfies every one.
		return { ok: true, json: async () => [], text: async () => "" } as unknown as Response;
	}) as never;

	const waits: Promise<unknown>[] = [];
	const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException: () => void 0 } as unknown as ExecutionContext;

	const res = await worker.fetch(
		new Request("https://search.queer.guide/search", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ query, lang: opts.lang ?? "en", debug: true, hitsPerPage: 10 }),
		}),
		env,
		ctx,
	);
	const body = (await res.json()) as Record<string, unknown>;
	await Promise.allSettled(waits);
	return { res, body, hybridArgs, embedTexts, llamaCalls };
}

afterEach(() => vi.restoreAllMocks());

describe("rewrite augments, never replaces", () => {
	it("Heldenbar: the keyword arm gets the literal name, the vector arm gets the translation", async () => {
		const h = await runSearch("Heldenbar", { q_en: "hero bar", synonyms: ["bar", "club"] });

		expect(h.llamaCalls).toBeGreaterThan(0); // positive control: the rewrite ran
		expect(h.hybridArgs).not.toBeNull();

		// THE DEFECT. Before the fix this was "hero bar".
		expect(h.hybridArgs!.p_query).toBe("Heldenbar");
		expect(h.hybridArgs!.p_query).not.toBe("hero bar");

		// …and the translation is not thrown away — it still drives the embedding.
		expect(h.embedTexts.length).toBeGreaterThan(0);
		expect(h.embedTexts[0]).toContain("hero bar");
		expect(h.embedTexts[0]).not.toContain("Heldenbar");
	});

	it("schwul: the German original still reaches the keyword arm, 'gay' still reaches the vector arm", async () => {
		// The whole point of the feature. Measured on prod, search_hybrid('schwul')
		// matches 182 German-language documents — recall the old code DISCARDED by
		// replacing the query with the translation.
		const h = await runSearch("schwul", { q_en: "gay", synonyms: ["queer", "lgbt"] }, { lang: "de" });

		expect(h.llamaCalls).toBeGreaterThan(0);
		expect(h.hybridArgs!.p_query).toBe("schwul");
		expect(h.embedTexts[0]).toContain("gay");
	});

	it("with no synonyms, the vector arm still gets the translation and only the translation", async () => {
		// Covers the other branch of the embedText ternary. Mutation-tested: the
		// two cases above both supply synonyms, so a mutation of the no-synonym
		// fallback alone slipped through until this existed.
		const h = await runSearch("Heldenbar", { q_en: "hero bar", synonyms: [] });
		expect(h.llamaCalls).toBeGreaterThan(0);
		expect(h.hybridArgs!.p_query).toBe("Heldenbar");
		expect(h.embedTexts[0]).toBe("hero bar");
	});

	it("Berghain: a rewrite that only echoes the query changes nothing on either arm", async () => {
		const h = await runSearch("Berghain", { q_en: "berghain" });

		expect(h.llamaCalls).toBeGreaterThan(0);
		expect(h.hybridArgs!.p_query).toBe("Berghain");
		// q_en differs only by case, so it is not treated as a translation: the
		// vector arm must not silently lose the original's casing/spelling either.
		expect(h.embedTexts[0].startsWith("Berghain")).toBe(true);
	});

	it("a failed rewrite leaves both arms on the original query", async () => {
		const h = await runSearch("Heldenbar", null);
		expect(h.llamaCalls).toBeGreaterThan(0); // it ran, and returned unparseable output
		expect(h.hybridArgs!.p_query).toBe("Heldenbar");
		expect(h.embedTexts[0]).toContain("Heldenbar");
	});

	it("debug exposes the two arms separately", async () => {
		const h = await runSearch("Heldenbar", { q_en: "hero bar" });
		const dbg = h.body.debug as Record<string, unknown>;
		// A single `effectiveQ` is what hid this defect; the two must be readable
		// independently or the next occurrence is just as invisible.
		expect(dbg.keywordQ).toBe("Heldenbar");
		expect(dbg.embedQ).toBe("hero bar");
	});
});
