import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { GROUP_TYPES, orderGroups } from "../src/grouping";

const account = "11111111-1111-4111-8111-111111111111";

type Rpc = { url: string; body: Record<string, unknown> };

/**
 * Drives the real worker against a fake PostgREST. `byType` is what
 * search_hybrid holds per content type; the mixed call (no p_content_types)
 * returns `mixed` in that order.
 */
async function search(
	body: object,
	opts: {
		auth?: boolean;
		byType?: Record<string, number>;
		mixed?: string[];
		failTypes?: string[];
		failMixed?: boolean;
		/** Title of the first hit per type (the rest stay "<type> <i>"). */
		firstTitle?: Record<string, string>;
	} = {},
) {
	const requests: Rpc[] = [];
	const wait: Promise<unknown>[] = [];
	const kv = { get: async () => null, put: async () => undefined };
	const env = {
		SUPABASE_URL: "https://fixture.supabase.co",
		SUPABASE_SERVICE_KEY: "test",
		ALLOWED_ORIGINS: "https://queer.guide",
		EMBED_CACHE: kv,
		SESSION_CACHE: kv,
		SESSION_SIGNING_KEY: "fixture-cookie-key",
		ENABLE_RERANKER: "0",
		AI: { run: async () => ({ data: [[0.1, 0.2, 0.3]] }) },
	} as unknown as Env;
	const byType = opts.byType ?? {};

	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: unknown, init?: RequestInit) => {
			const url = String(input);
			const rpcBody = init?.body ? JSON.parse(String(init.body)) : {};
			requests.push({ url, body: rpcBody });
			if (url.endsWith("/auth/v1/user")) return Response.json({ id: account });
			if (url.endsWith("/rpc/search_hybrid")) {
				// The mixed call carries every searchable type (or none); a
				// per-type call carries exactly one.
				const types = rpcBody.p_content_types as string[] | null;
				if (!types || types.length !== 1) {
					if (opts.failMixed) return new Response("unavailable", { status: 502 });
					const mixed = opts.mixed ?? [];
					const hits = mixed.map((t, i) => ({ objectID: `m${i}`, title: `Mixed ${i}`, type: t }));
					return Response.json({ total: 999, hits, filterContract: 2 });
				}
				const t = types[0];
				if (opts.failTypes?.includes(t)) return new Response("unavailable", { status: 502 });
				const n = byType[t] ?? 0;
				const limit = Number(rpcBody.p_limit);
				const hits = Array.from({ length: Math.min(n, limit) }, (_, i) => ({
					objectID: `${t}${i}`,
					title: i === 0 && opts.firstTitle?.[t] ? opts.firstTitle[t] : `${t} ${i}`,
					type: t,
				}));
				return Response.json({ total: n, hits, filterContract: 2 });
			}
			return Response.json(url.endsWith("/rpc/search_facets") ? {} : []);
		}),
	);
	const response = await worker.fetch(
		new Request("https://search.queer.guide/", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "https://queer.guide",
				...(opts.auth ? { Authorization: "Bearer fixture-token" } : {}),
			},
			body: JSON.stringify(body),
		}),
		env,
		{ waitUntil: (p: Promise<unknown>) => wait.push(p) } as unknown as ExecutionContext,
	);
	await Promise.all(wait);
	const data = (await response.json()) as {
		groups?: Array<{ type: string; total: number; hits: Array<{ objectID: string; type: string }> }>;
		hits?: unknown[];
		groupErrors?: string[];
		code?: string;
	};
	return { response, requests, data };
}

const hybridCalls = (r: Rpc[]) => r.filter(({ url }) => url.endsWith("/rpc/search_hybrid"));
const facetCalls = (r: Rpc[]) => r.filter(({ url }) => url.endsWith("/rpc/search_facets"));

afterEach(() => vi.unstubAllGlobals());

describe("grouped search overview (groupBy: 'type')", () => {
	it("runs one mixed call and one call per type, and facets only once", async () => {
		const { response, requests } = await search({ query: "drag show", groupBy: "type" });
		expect(response.status).toBe(200);
		const calls = hybridCalls(requests);
		expect(calls).toHaveLength(1 + GROUP_TYPES.length);
		const perType = calls
			.map(({ body }) => body.p_content_types as string[] | null)
			.filter((t): t is string[] => !!t && t.length === 1);
		expect(perType.map((t) => t[0]).sort()).toEqual([...GROUP_TYPES].sort());
		// Exactly one call is not per-type: the mixed one that orders the sections.
		expect(calls.length - perType.length).toBe(1);
		// Section counts come from each call's own total; facets run once, for the mixed call.
		expect(facetCalls(requests)).toHaveLength(1);
	});

	it("sizes the ordering call like the flat search, not larger", async () => {
		const { requests } = await search({ query: "drag show", groupBy: "type", hitsPerPage: 20 });
		const mixed = hybridCalls(requests).filter(({ body }) => {
			const t = body.p_content_types as string[] | null;
			return !t || t.length !== 1;
		});
		expect(mixed).toHaveLength(1);
		expect(mixed[0].body.p_limit).toBe(20);
	});

	it("orders sections by the mixed ranking, drops empty types, and caps hits at perType", async () => {
		const { data } = await search(
			{ query: "drag show", groupBy: "type", perType: 3 },
			{
				byType: { event: 12, venue: 5, news: 2, city: 0, tag: 9 },
				// Events lead the mixed list, then news, then venues. Tags never appear in it.
				mixed: ["event", "event", "news", "venue"],
			},
		);
		expect(data.groups?.map((g) => g.type)).toEqual(["event", "news", "venue", "tag"]);
		expect(data.groups?.map((g) => g.total)).toEqual([12, 2, 5, 9]);
		expect(data.groups?.map((g) => g.hits.length)).toEqual([3, 2, 3, 3]);
		expect(data.groups?.every((g) => g.hits.every((h) => h.type === g.type))).toBe(true);
	});

	it("keeps safety-gated content hidden from anonymous callers on every call", async () => {
		const { requests } = await search({ query: "drag show", groupBy: "type" }, { byType: { venue: 2 } });
		const calls = [...hybridCalls(requests), ...facetCalls(requests)];
		expect(calls.length).toBeGreaterThan(GROUP_TYPES.length);
		expect(calls.every(({ body }) => (body.p_filters as Record<string, unknown>)?.include_gated === undefined)).toBe(true);
	});

	it("passes include_gated on every call for a verified signed-in caller", async () => {
		const { requests } = await search({ query: "drag show", groupBy: "type" }, { auth: true, byType: { venue: 2 } });
		const calls = hybridCalls(requests);
		expect(calls).toHaveLength(1 + GROUP_TYPES.length);
		expect(calls.every(({ body }) => (body.p_filters as Record<string, unknown>)?.include_gated === true)).toBe(true);
	});

	it("restricts the sections to the requested types", async () => {
		const { requests, data } = await search(
			{ query: "drag show", groupBy: "type", filters: { types: ["venue", "event"] } },
			{ byType: { venue: 1, event: 1, news: 5 } },
		);
		const perType = hybridCalls(requests)
			.map(({ body }) => body.p_content_types as string[] | null)
			.filter((t): t is string[] => !!t && t.length === 1)
			.map((t) => t[0]);
		expect(perType.sort()).toEqual(["event", "venue"]);
		expect(data.groups?.map((g) => g.type).sort()).toEqual(["event", "venue"]);
	});

	it("omits a type whose call fails and names it, instead of failing the page", async () => {
		const { response, data } = await search(
			{ query: "drag show", groupBy: "type" },
			{ byType: { venue: 2, event: 2 }, failTypes: ["event"], mixed: ["event", "venue"] },
		);
		expect(response.status).toBe(200);
		expect(data.groups?.map((g) => g.type)).toEqual(["venue"]);
		expect(data.groupErrors).toEqual(["event"]);
	});

	it("still returns the sections, ordered by total, when only the ordering call fails", async () => {
		const { response, data } = await search(
			{ query: "drag show", groupBy: "type" },
			{ failMixed: true, byType: { venue: 3, event: 9, news: 1 } },
		);
		expect(response.status).toBe(200);
		expect(data.groups?.map((g) => g.type)).toEqual(["event", "venue", "news"]);
		expect((data as { orderFallback?: boolean }).orderFallback).toBe(true);
		expect((data as { totalHits?: number }).totalHits).toBe(13);
	});

	it("leads with the section named after the query when the ordering call fails", async () => {
		// The production shape: a cold "berlin" whose mixed call timed out.
		// Venues are the biggest section, but the City section IS the query.
		const { response, data } = await search(
			{ query: "berlin", groupBy: "type" },
			{
				failMixed: true,
				byType: { venue: 40, event: 25, city: 1, news: 6 },
				firstTitle: { city: "Berlin" },
			},
		);
		expect(response.status).toBe(200);
		expect((data as { orderFallback?: boolean }).orderFallback).toBe(true);
		expect(data.groups?.map((g) => g.type)).toEqual(["city", "venue", "event", "news"]);
	});

	it("keeps the mixed ranking authoritative when the ordering call succeeds", async () => {
		const { data } = await search(
			{ query: "berlin", groupBy: "type" },
			{
				byType: { venue: 40, event: 25, city: 1 },
				firstTitle: { city: "Berlin" },
				mixed: ["event", "venue", "city"],
			},
		);
		expect(data.groups?.map((g) => g.type)).toEqual(["event", "venue", "city"]);
	});

	it("answers 503 only when every call fails", async () => {
		const { response, data } = await search(
			{ query: "drag show", groupBy: "type" },
			{ failMixed: true, failTypes: [...GROUP_TYPES] },
		);
		expect(response.status).toBe(503);
		expect(data.code).toBe("search_unavailable");
	});

	it("rejects an unknown groupBy value", async () => {
		const { response } = await search({ query: "drag show", groupBy: "city" });
		expect(response.status).toBe(400);
	});

	it("leaves the flat response unchanged without groupBy", async () => {
		const { requests, data } = await search({ query: "drag show" }, { mixed: ["event"] });
		expect(hybridCalls(requests)).toHaveLength(1);
		expect(data.groups).toBeUndefined();
		expect(Array.isArray(data.hits)).toBe(true);
	});
});

describe("orderGroups", () => {
	const g = (type: string, total: number, n = 1) => ({
		type,
		total,
		hits: Array.from({ length: n }, (_, i) => ({ type, objectID: `${type}${i}` })),
	});

	it("orders by first appearance in the mixed ranking", () => {
		const out = orderGroups([{ type: "city" }, { type: "venue" }, { type: "city" }, { type: "event" }], [
			g("event", 1),
			g("venue", 1),
			g("city", 1),
		]);
		expect(out.map((x) => x.type)).toEqual(["city", "venue", "event"]);
	});

	it("puts types missing from the mixed ranking last, largest first, then by scope order", () => {
		const out = orderGroups([{ type: "news" }], [g("tag", 3), g("venue", 3), g("event", 9), g("news", 1)]);
		expect(out.map((x) => x.type)).toEqual(["news", "event", "venue", "tag"]);
	});

	describe("when the mixed ranking is unavailable", () => {
		const titled = (type: string, total: number, title: string) => ({
			type,
			total,
			hits: [{ type, objectID: `${type}0`, title }, { type, objectID: `${type}1`, title: `${type} 1` }],
		});

		it("puts a city named exactly the query first, ahead of larger sections", () => {
			const out = orderGroups(
				[],
				[titled("venue", 40, "Berlin Bar"), titled("event", 25, "Pride"), titled("city", 1, "Berlin")],
				"berlin",
			);
			expect(out.map((x) => x.type)).toEqual(["city", "venue", "event"]);
		});

		it("matches case- and whitespace-insensitively, and through aliases", () => {
			const aliased = {
				type: "city",
				total: 1,
				hits: [{ type: "city", objectID: "c0", title: "München", aliases: ["Munich"] }],
			};
			expect(orderGroups([], [g("venue", 9), aliased], "  MUNICH ").map((x) => x.type)).toEqual(["city", "venue"]);
		});

		it("lets a city beat another type that also has an exact title", () => {
			const out = orderGroups(
				[],
				[titled("venue", 40, "Berlin"), titled("city", 1, "Berlin"), titled("event", 25, "x")],
				"berlin",
			);
			expect(out.map((x) => x.type)).toEqual(["city", "venue", "event"]);
		});

		it("lifts a non-city exact title above larger sections", () => {
			const out = orderGroups(
				[],
				[titled("venue", 40, "Gay Bar"), titled("personality", 1, "Rock Hudson")],
				"rock hudson",
			);
			expect(out.map((x) => x.type)).toEqual(["personality", "venue"]);
		});

		it("only looks at a section's first hit", () => {
			const late = {
				type: "city",
				total: 2,
				hits: [{ type: "city", objectID: "c0", title: "Berlin, NH" }, { type: "city", objectID: "c1", title: "Berlin" }],
			};
			expect(orderGroups([], [g("venue", 9), late], "berlin").map((x) => x.type)).toEqual(["venue", "city"]);
		});

		it("falls back to total when nothing matches the query exactly, or there is no query", () => {
			const groups = [titled("city", 1, "Berlin"), titled("venue", 40, "Berlin Bar")];
			expect(orderGroups([], groups, "gay bar").map((x) => x.type)).toEqual(["venue", "city"]);
			expect(orderGroups([], groups).map((x) => x.type)).toEqual(["venue", "city"]);
		});
	});

	it("never lets an exact title outrank a type that appears in the mixed ranking", () => {
		const out = orderGroups(
			[{ type: "venue" }],
			[g("venue", 40), { type: "city", total: 1, hits: [{ type: "city", objectID: "c0", title: "Berlin" }] }],
			"berlin",
		);
		expect(out.map((x) => x.type)).toEqual(["venue", "city"]);
	});

	it("drops groups with no hits", () => {
		expect(orderGroups([], [g("venue", 0, 0), g("event", 2)]).map((x) => x.type)).toEqual(["event"]);
	});
});
