import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

async function search(body: object, options: { fail?: boolean; rerank?: object[] } = {}) {
	const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
	const wait: Promise<unknown>[] = [];
	const kv = { get: async () => null, put: async () => undefined };
	const env = {
		SUPABASE_URL: "https://fixture.supabase.co",
		SUPABASE_SERVICE_KEY: "test",
		ALLOWED_ORIGINS: "https://queer.guide",
		EMBED_CACHE: kv,
		SESSION_CACHE: kv,
		ENABLE_RERANKER: options.rerank ? "1" : "0",
		AI: {
			run: async (model: string) => model.includes("reranker")
				? { response: options.rerank }
				: { data: [[0.1, 0.2, 0.3]] },
		},
	} as unknown as Env;

	vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
		const url = String(input);
		requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
		if (url.endsWith("/rpc/search_hybrid")) {
			if (options.fail) return new Response("unavailable", { status: 502 });
			const hits = Array.from({ length: options.rerank ? 25 : 1 }, (_, index) => ({
				objectID: String(index),
				title: `Fixture ${index}`,
				type: "event",
			}));
			return Response.json({ total: hits.length, hits });
		}
		return Response.json(url.endsWith("/rpc/search_facets") ? {} : []);
	}));
	const response = await worker.fetch(
		new Request("https://search.queer.guide/", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: "https://queer.guide" },
			body: JSON.stringify(body),
		}),
		env,
		{ waitUntil: (p: Promise<unknown>) => wait.push(p) } as unknown as ExecutionContext,
	);
	await Promise.all(wait);
	return { response, requests, data: await response.json() as { hits?: Array<{ objectID: string }>; code?: string } };
}

afterEach(() => vi.unstubAllGlobals());

describe("search request integrity", () => {
	it.each(["sauna Berlin", ""])("returns a retryable response when the backend fails for %j", async (query) => {
		const { response, data, requests } = await search({ query, filters: { types: ["event"] } }, { fail: true });
		expect(response.status).toBe(503);
		expect(data.code).toBe("search_unavailable");
		expect(requests.some(({ url }) => url.endsWith("/rpc/search_hybrid"))).toBe(true);
		expect(requests.some(({ url }) => url.includes("popular_entities"))).toBe(false);
	});

	it.each(["trans", ""])("sends scoped searches to the same filtered backend for %j", async (query) => {
		const { response, requests } = await search({ query, filters: { types: ["event"] } });
		expect(response.status).toBe(200);
		const rpc = requests.find(({ url }) => url.endsWith("/rpc/search_hybrid"));
		expect(rpc?.body).toMatchObject({ p_query: query, p_content_types: ["event"] });
	});

	it.each(["Berlin", ""])("passes category and cluster selections to both RPCs for %j", async (query) => {
		const filters = { categories: ["bar", "cafe"], cluster_ids: ["nightlife", "sober-spaces"] };
		const { response, requests } = await search({ query, filters });
		expect(response.status).toBe(200);
		for (const name of ["search_hybrid", "search_facets"]) {
			const rpc = requests.find(({ url }) => url.endsWith(`/rpc/${name}`));
			expect(rpc?.body.p_filters).toEqual(filters);
		}
	});

	it("executes a cluster-only browse", async () => {
		const { response, requests } = await search({ query: "", filters: { cluster_ids: ["nightlife"] } });
		expect(response.status).toBe(200);
		expect(requests.find(({ url }) => url.endsWith("/rpc/search_hybrid"))?.body.p_filters)
			.toEqual({ cluster_ids: ["nightlife"] });
	});

	it("preserves the full page when reranker scores are partial or malformed", async () => {
		const { data } = await search({ query: "fixture event", hitsPerPage: 25 }, {
			rerank: [{ index: 2, score: 0.9 }, { index: 2, score: 0.8 }, { index: 50, score: 1 }],
		});
		expect(data.hits?.[0].objectID).toBe("2");
		expect(new Set(data.hits?.map((hit) => hit.objectID)).size).toBe(25);
	});
});
