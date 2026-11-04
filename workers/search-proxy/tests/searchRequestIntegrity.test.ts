import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const account = "11111111-1111-4111-8111-111111111111";
const otherAccount = "22222222-2222-4222-8222-222222222222";

async function search(body: object, options: { fail?: boolean; rerank?: object[]; path?: string; auth?: boolean; oldDatabase?: boolean; analytics?: boolean } = {}) {
	const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
	const wait: Promise<unknown>[] = [];
	const kv = { get: async () => null, put: async () => undefined };
	const env = {
		SUPABASE_URL: "https://fixture.supabase.co",
		SUPABASE_SERVICE_KEY: "test",
		ALLOWED_ORIGINS: "https://queer.guide",
		EMBED_CACHE: kv,
		SESSION_CACHE: kv,
		SESSION_SIGNING_KEY: "fixture-cookie-key",
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
		if (url.endsWith("/auth/v1/user")) return Response.json({ id: account });
		if (url.endsWith("/rpc/search_hybrid")) {
			if (options.fail) return new Response("unavailable", { status: 502 });
			const hits = Array.from({ length: options.rerank ? 25 : 1 }, (_, index) => ({
				objectID: String(index),
				title: `Fixture ${index}`,
				type: "event",
			}));
			return Response.json({ total: hits.length, hits, ...(options.oldDatabase ? {} : { filterContract: 2 }) });
		}
		return Response.json(url.endsWith("/rpc/search_facets") ? {} : []);
	}));
	const response = await worker.fetch(
		new Request(`https://search.queer.guide${options.path ?? "/"}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: "https://queer.guide", ...(options.auth ? { Authorization: "Bearer fixture-token" } : {}), ...(options.analytics ? { "X-Search-Analytics": "1" } : {}) },
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
	it("ignores account and session IDs supplied by anonymous callers", async () => {
		const { response, requests } = await search({ query: "Berlin", user_id: otherAccount, session_id: "borrowed" });
		expect(response.status).toBe(200);
		expect(requests.some(({ url }) => /get_(bias|user)_signal/.test(url))).toBe(false);
	});

	it("uses the verified subject for personalization and ignores a different body ID", async () => {
		const { response, requests } = await search({ query: "Berlin", user_id: otherAccount }, { auth: true });
		expect(response.status).toBe(200);
		const signals = requests.filter(({ url }) => /get_(bias|user)_signal/.test(url));
		expect(signals).toHaveLength(2);
		expect(signals.map(({ body }) => body.p_user_id)).toEqual([account, account]);
	});

	it("records feedback for the verified account and a server-generated session", async () => {
		const { response, requests } = await search({
			user_id: otherAccount, session_id: "borrowed-session",
			entity_type: "venue", entity_id: account, vote: "up",
		}, { path: "/feedback", auth: true });
		expect(response.status).toBe(200);
		expect(response.headers.get("Set-Cookie")).toContain("qg_sid_v2=");
		const event = requests.find(({ url }) => url.endsWith("/rpc/track_user_event"));
		expect(event?.body.p_user_id).toBe(account);
		expect(event?.body.p_session_id).toMatch(/^[0-9a-f-]{36}$/);
		expect(event?.body.p_session_id).not.toBe("borrowed-session");
	});

	it.each([[false, otherAccount, 401], [true, otherAccount, 403], [true, account, 200]] as const)(
		"restricts profile updates to the verified account (auth %s, body ID %s)",
		async (auth, user_id, status) => {
			const { response, requests } = await search({ user_id, vibes: ["art"] }, { path: "/onboarding", auth });
			expect(response.status).toBe(status);
			expect(requests.filter(({ url }) => url.includes("/profiles?")).map(({ url }) => url))
				.toEqual(status === 200 ? [`https://fixture.supabase.co/rest/v1/profiles?user_id=eq.${account}`] : []);
		},
	);

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

	it("rejects a filtered response when the database does not implement the filters", async () => {
		const { response, data } = await search(
			{ query: "Berlin", filters: { categories: ["bar", "cafe"] } },
			{ oldDatabase: true },
		);
		expect(response.status).toBe(503);
		expect(data.code).toBe("search_unavailable");
	});

	it("advertises signed read credentials to the configured site", async () => {
		const { response } = await search({ query: "Berlin" });
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://queer.guide");
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
		expect(response.headers.get("Access-Control-Expose-Headers")).toContain("X-Search-Session");
		expect(response.headers.get("X-Search-Session")).toBe("v2");
	});

	it("only records the first search page after analytics opt-in", async () => {
		for (const [page, analytics, expected] of [[0, false, 0], [0, true, 1], [1, true, 0]] as const) {
			const { requests, response } = await search({ query: "Berlin", page }, { analytics });
			expect(response.status).toBe(200);
			expect(requests.filter(({ url }) => url.endsWith("/rpc/log_search"))).toHaveLength(expected);
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
