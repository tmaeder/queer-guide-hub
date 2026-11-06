import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/index";

/**
 * The reranker and the facet counts may not hold up /search.
 *
 * Measured on prod 2026-11-05 (debug.timings): a first-time multi-word search
 * spent ~0.67s in the reranker AFTER the database had answered, and
 * search_facets finished ~0.2s after search_hybrid. Both now get a hot-path
 * budget; a miss is finished in the background (ctx.waitUntil) into KV.
 */

const RERANKER = "@cf/baai/bge-reranker-base";
const EMBED = "@cf/baai/bge-m3";
const QUERY = "queer bookshop porto"; // 3 words: no LLM rewrite, reranker eligible

function kv() {
	const m = new Map<string, string>();
	return {
		map: m,
		ns: {
			get: async (k: string, opts?: unknown) => {
				const v = m.get(k);
				if (v === undefined) return null;
				const asJson = opts === "json" || (typeof opts === "object" && opts !== null && (opts as { type?: string }).type === "json");
				return asJson ? JSON.parse(v) : v;
			},
			put: async (k: string, v: string) => void m.set(k, v),
		} as unknown as KVNamespace,
	};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Opts {
	rerankDelayMs?: number;
	facetsDelayMs?: number;
	body?: Record<string, unknown>;
	cache?: ReturnType<typeof kv>;
}

async function run(opts: Opts = {}) {
	const cache = opts.cache ?? kv();
	const calls = { hybrid: 0, facets: 0, rerank: 0 };
	const env = {
		SUPABASE_URL: "https://x.supabase.co",
		SUPABASE_SERVICE_KEY: "k",
		ALLOWED_ORIGINS: "https://queer.guide",
		ENABLE_RERANKER: "1",
		EMBED_CACHE: cache.ns,
		SESSION_CACHE: kv().ns,
		AI: {
			run: async (model: string) => {
				if (model === EMBED) return { data: [[0.1, 0.2, 0.3]] };
				if (model === RERANKER) {
					calls.rerank++;
					if (opts.rerankDelayMs) await sleep(opts.rerankDelayMs);
					// Prefer the SECOND hit, so a used reranker visibly reorders.
					return { response: [{ id: 1, score: 0.9 }, { id: 0, score: 0.1 }] };
				}
				return {};
			},
		},
	} as unknown as Env;

	global.fetch = vi.fn(async (url: unknown) => {
		const u = String(url);
		if (u.includes("/rpc/search_hybrid")) {
			calls.hybrid++;
			return {
				ok: true,
				json: async () => ({
					total: 2,
					hits: [
						{ objectID: "a", type: "venue", title: "Livraria A", _rankingScore: 0.3 },
						{ objectID: "b", type: "venue", title: "Livraria B", _rankingScore: 0.2 },
					],
				}),
			} as unknown as Response;
		}
		if (u.includes("/rpc/search_facets")) {
			calls.facets++;
			if (opts.facetsDelayMs) await sleep(opts.facetsDelayMs);
			return { ok: true, json: async () => ({ type: { venue: 2 } }) } as unknown as Response;
		}
		return { ok: true, json: async () => [], text: async () => "" } as unknown as Response;
	}) as never;

	const waits: Promise<unknown>[] = [];
	const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException: () => void 0 } as unknown as ExecutionContext;
	const res = await worker.fetch(
		new Request("https://search.queer.guide/search", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ query: QUERY, debug: true, hitsPerPage: 10, ...opts.body }),
		}),
		env,
		ctx,
	);
	const body = (await res.json()) as Record<string, unknown>;
	await Promise.allSettled(waits);
	return { res, body, calls, cache };
}

const ids = (b: Record<string, unknown>) => ((b.hits as Array<{ id: string }>) ?? []).map((h) => h.id);
const dbg = (b: Record<string, unknown>) => b.debug as Record<string, unknown>;

afterEach(() => vi.restoreAllMocks());

describe("reranker budget", () => {
	it("uses the reranker's order when it answers in time", async () => {
		const { body, calls } = await run();
		expect(calls.rerank).toBe(1);
		expect(dbg(body).rerankOutcome).toBe("used");
		expect(ids(body)).toEqual(["b", "a"]);
	});

	it("serves the database order when the reranker is slow, and caches it for next time", async () => {
		const { body, calls, cache } = await run({ rerankDelayMs: 900 });
		expect(calls.rerank).toBe(1); // positive control: it was called
		expect(dbg(body).rerankOutcome).toBe("over_budget");
		expect(ids(body)).toEqual(["a", "b"]);
		const t = dbg(body).timings as Record<string, number>;
		expect(t.rerankWaitMs).toBeGreaterThanOrEqual(250);
		expect(t.rerankWaitMs).toBeLessThan(800);
		// …it still finished under waitUntil and landed in rerank()'s KV cache,
		const cached = [...cache.map.keys()].filter((k) => k.startsWith("rr:"));
		expect(cached).toHaveLength(1);
		// so the same search next time is reranked without calling the model.
		const again = await run({ rerankDelayMs: 900, cache });
		expect(again.calls.rerank).toBe(0);
		expect(dbg(again.body).rerankOutcome).toBe("used");
		expect(ids(again.body)).toEqual(["b", "a"]);
	});
});

describe("facet grace window", () => {
	it("returns facets inline when they arrive with the hits", async () => {
		const { body } = await run();
		expect(body.facetsPending).toBeUndefined();
		expect(JSON.stringify(body.facetDistribution)).toContain("venue");
	});

	it("does not hold the hits for slow facets, and the follow-up reads them from KV", async () => {
		const { body, calls, cache } = await run({ facetsDelayMs: 600 });
		expect(calls.facets).toBe(1);
		expect(ids(body)).toHaveLength(2); // the hits are there
		expect(body.facetsPending).toBe(true);
		expect(body.facetDistribution).toEqual({});
		// Blocked for roughly the grace window, not the 600 ms the RPC took.
		expect((dbg(body).timings as Record<string, number>).totalMs).toBeLessThan(500);
		// The late answer was cached.
		const cached = [...cache.map.entries()].filter(([k]) => k.startsWith("fx:"));
		expect(cached).toHaveLength(1);
		expect(cached[0][1]).toContain("venue");

		// The follow-up is a KV read: neither RPC runs.
		const follow = await run({ cache, body: { facetsOnly: true } });
		expect(follow.body.facetsOnly).toBe(true);
		expect(JSON.stringify(follow.body.facetDistribution)).toContain("venue");
		expect(follow.calls.hybrid).toBe(0);
		expect(follow.calls.facets).toBe(0);
		expect(follow.body.hits).toBeUndefined();
	});

	it("never serves another query's cached counts", async () => {
		const first = await run({ facetsDelayMs: 600 });
		const other = await run({
			cache: first.cache,
			body: { query: "leather night vienna", facetsOnly: true },
		});
		expect(other.calls.facets).toBe(1); // computed for its own query instead
		expect(other.calls.hybrid).toBe(0); // and still skipped the hits
	});

	it("computes the facets when the cache has not been written yet", async () => {
		const { body, calls } = await run({ body: { facetsOnly: true } });
		expect(calls.facets).toBe(1);
		expect(calls.hybrid).toBe(0);
		expect(JSON.stringify(body.facetDistribution)).toContain("venue");
	});
});
