import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { BATCHED_GROUP_TYPES, GROUP_TYPES, orderGroups } from "../src/grouping";

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
		/** The site reports analytics opt-in (X-Search-Analytics: 1). */
		analytics?: boolean;
		byType?: Record<string, number>;
		mixed?: string[];
		failTypes?: string[];
		failMixed?: boolean;
		/** search_hybrid_by_type itself fails (e.g. not deployed yet). */
		failBatch?: boolean;
		/** Types search_hybrid_by_type leaves out of its answer. */
		dropFromBatch?: string[];
		/** filterContract search_hybrid_by_type reports (default 2). */
		batchContract?: number;
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
			const typeResult = (t: string) => {
				if (opts.failTypes?.includes(t)) return null;
				const n = byType[t] ?? 0;
				const limit = Number(rpcBody.p_limit);
				const hits = Array.from({ length: Math.min(n, limit) }, (_, i) => ({
					objectID: `${t}${i}`,
					title: i === 0 && opts.firstTitle?.[t] ? opts.firstTitle[t] : `${t} ${i}`,
					type: t,
				}));
				return { total: n, hits, filterContract: 2 };
			};
			if (url.endsWith("/rpc/search_hybrid_by_type")) {
				// One statement: a type that fails takes the whole batch with it.
				if (opts.failBatch) return new Response("unavailable", { status: 502 });
				const out: Record<string, unknown> = {};
				for (const t of rpcBody.p_types as string[]) {
					const r = typeResult(t);
					if (!r) return new Response("unavailable", { status: 502 });
					if (opts.dropFromBatch?.includes(t)) continue;
					out[t] = { ...r, filterContract: opts.batchContract ?? 2 };
				}
				return Response.json(out);
			}
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
				const r = typeResult(types[0]);
				return r ? Response.json(r) : new Response("unavailable", { status: 502 });
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
				...(opts.analytics ? { "X-Search-Analytics": "1" } : {}),
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
const batchCalls = (r: Rpc[]) => r.filter(({ url }) => url.endsWith("/rpc/search_hybrid_by_type"));
/** Every call that returns hits: the mixed one, each separate type, and the batch. */
const searchCalls = (r: Rpc[]) => [...hybridCalls(r), ...batchCalls(r)];

afterEach(() => vi.unstubAllGlobals());

describe("grouped search overview (groupBy: 'type')", () => {
	it("logs an opted-in All-tab search once, and never without opt-in", async () => {
		const logs = (r: Rpc[]) => r.filter(({ url }) => url.endsWith("/rpc/log_search"));
		const optedIn = await search(
			{ query: "drag show", groupBy: "type" },
			{ analytics: true, byType: { venue: 2, milestone: 1 } },
		);
		expect(logs(optedIn.requests)).toHaveLength(1);
		// The number of results shown on the overview, so zero-result analytics still works.
		expect(logs(optedIn.requests)[0].body.p_n_results).toBe(3);
		const notOptedIn = await search({ query: "drag show", groupBy: "type" }, { byType: { venue: 2 } });
		expect(logs(notOptedIn.requests)).toHaveLength(0);
	});

	it("does not count the client's re-fetch of failed sections as a second search", async () => {
		const { requests } = await search(
			{ query: "drag show", groupBy: "type", filters: { types: ["milestone"] } },
			{ analytics: true, byType: { milestone: 1 } },
		);
		expect(requests.filter(({ url }) => url.endsWith("/rpc/log_search"))).toHaveLength(0);
	});

	it("runs one mixed call, one call per big type, one batch for the small types, and facets once", async () => {
		const { response, requests } = await search({ query: "drag show", groupBy: "type" });
		expect(response.status).toBe(200);
		const perType = hybridCalls(requests)
			.map(({ body }) => body.p_content_types as string[] | null)
			.filter((t): t is string[] => !!t && t.length === 1)
			.map((t) => t[0]);
		const separate = GROUP_TYPES.filter((t) => !BATCHED_GROUP_TYPES.has(t));
		expect(perType.sort()).toEqual([...separate].sort());
		// Exactly one search_hybrid call is not per-type: the mixed one that orders the sections.
		expect(hybridCalls(requests).length - perType.length).toBe(1);
		// Every other type goes out in ONE batch request.
		const batches = batchCalls(requests);
		expect(batches).toHaveLength(1);
		expect([...(batches[0].body.p_types as string[])].sort()).toEqual(
			GROUP_TYPES.filter((t) => BATCHED_GROUP_TYPES.has(t)).sort(),
		);
		// Together they cover every type exactly once.
		expect([...perType, ...(batches[0].body.p_types as string[])].sort()).toEqual([...GROUP_TYPES].sort());
		// Section counts come from each call's own total; facets run once, for the mixed call.
		expect(facetCalls(requests)).toHaveLength(1);
	});

	it("searches a batched type with the arguments its own call would use", async () => {
		const { requests } = await search({ query: "drag show", groupBy: "type", perType: 3 });
		const venue = hybridCalls(requests).find(({ body }) => (body.p_content_types as string[] | null)?.[0] === "venue");
		const batch = batchCalls(requests)[0];
		expect(venue && batch).toBeTruthy();
		const { p_content_types: _a, ...venueRest } = venue!.body;
		const { p_types: _b, ...batchRest } = batch.body;
		expect(batchRest).toEqual(venueRest);
	});

	it("falls back to separate calls when the batch fails, so no section goes missing", async () => {
		const { data, requests } = await search(
			{ query: "drag show", groupBy: "type" },
			{ byType: { milestone: 3, venue: 2 }, mixed: ["venue", "milestone"], failBatch: true },
		);
		expect(data.groupErrors).toBeUndefined();
		expect(data.groups?.map((g) => g.type)).toEqual(["venue", "milestone"]);
		const perType = hybridCalls(requests).map(({ body }) => (body.p_content_types as string[] | null)?.[0]);
		for (const t of BATCHED_GROUP_TYPES) expect(perType).toContain(t);
	});

	it("names a type the batch left out of its answer", async () => {
		const { data } = await search(
			{ query: "drag show", groupBy: "type" },
			{ byType: { milestone: 3, venue: 2 }, mixed: ["venue", "milestone"], dropFromBatch: ["milestone"] },
		);
		expect(data.groupErrors).toEqual(["milestone"]);
		expect(data.groups?.map((g) => g.type)).toEqual(["venue"]);
	});

	it("does not trust a batch that did not apply the category filter", async () => {
		// The filter contract says whether search_hybrid applied categories/cluster_ids.
		// A batch that cannot confirm it is discarded and its types searched separately.
		const { data, requests } = await search(
			{ query: "drag show", groupBy: "type", filters: { categories: ["bar"] } },
			{ byType: { milestone: 3, venue: 2 }, mixed: ["venue", "milestone"], batchContract: 1 },
		);
		const perType = hybridCalls(requests).map(({ body }) => (body.p_content_types as string[] | null)?.[0]);
		expect(perType).toContain("milestone");
		expect(data.groups?.map((g) => g.type)).toContain("milestone");
	});

	it("names a batched type that still fails after the fallback", async () => {
		const { data } = await search(
			{ query: "drag show", groupBy: "type" },
			{ byType: { milestone: 3, venue: 2 }, mixed: ["venue", "milestone"], failTypes: ["milestone"] },
		);
		expect(data.groupErrors).toEqual(["milestone"]);
		expect(data.groups?.map((g) => g.type)).toEqual(["venue"]);
	});

	it("searches the Knowledge types too, so history and rights reach the All tab", async () => {
		// Regression: the overview once fanned out over eight types only, and a
		// query like "marriage equality" lost all 15 milestones its flat top 20 had.
		for (const t of ["milestone", "country", "organization", "guide"]) {
			expect(GROUP_TYPES as readonly string[]).toContain(t);
		}
		const { data } = await search(
			{ query: "marriage equality", groupBy: "type" },
			{ byType: { milestone: 15, country: 3, news: 4 }, mixed: ["milestone", "news", "country"] },
		);
		expect(data.groups?.map((g) => g.type)).toEqual(["milestone", "news", "country"]);
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
		const calls = [...searchCalls(requests), ...facetCalls(requests)];
		// mixed + each separate type + the batch + facets
		expect(calls.length).toBe(1 + (GROUP_TYPES.length - BATCHED_GROUP_TYPES.size) + 1 + 1);
		expect(calls.every(({ body }) => (body.p_filters as Record<string, unknown>)?.include_gated === undefined)).toBe(true);
	});

	it("passes include_gated on every call for a verified signed-in caller", async () => {
		const { requests } = await search({ query: "drag show", groupBy: "type" }, { auth: true, byType: { venue: 2 } });
		const calls = searchCalls(requests);
		expect(calls).toHaveLength(1 + (GROUP_TYPES.length - BATCHED_GROUP_TYPES.size) + 1);
		expect(batchCalls(requests)).toHaveLength(1);
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

	it("returns the mixed type order, including a type whose own call failed", async () => {
		const { data } = await search(
			{ query: "drag show", groupBy: "type" },
			{ byType: { venue: 2, event: 2, news: 1 }, failTypes: ["event"], mixed: ["news", "event", "venue", "news"] },
		);
		expect((data as { typeOrder?: string[] }).typeOrder).toEqual(["news", "event", "venue"]);
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
		// No mixed ranking, so no order to hand back.
		expect((data as { typeOrder?: string[] }).typeOrder).toBeUndefined();
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

describe("history queries lead with History", () => {
	// Section totals and first titles as measured on prod, 2026-11-27.
	const sec = (type: string, total: number, title: string) => ({
		type,
		total,
		hits: [{ type, objectID: `${type}0`, title }],
	});
	const order = (mixed: string[], groups: ReturnType<typeof sec>[], query: string) =>
		orderGroups(
			mixed.map((type) => ({ type })),
			groups,
			query,
		).map((x) => x.type);

	it("moves History first when it names the query and is a real share of the results", () => {
		expect(
			order(
				["organization", "news", "marketplace", "milestone"],
				[
					sec("organization", 13, "Marriage Equality"),
					sec("news", 184, "Court rules on marriage equality"),
					sec("marketplace", 5, "Love is love tee"),
					sec("milestone", 176, "Marriage equality — Thailand (first in Southeast Asia)"),
					sec("country", 40, "Thailand"),
				],
				"marriage equality",
			)[0],
		).toBe("milestone");
		expect(
			order(
				["venue", "news", "milestone"],
				[
					sec("venue", 3, "Bar Mattachine"),
					sec("news", 35, "Remembering the Mattachine founders"),
					sec("milestone", 10, "Mattachine Society formed as an early gay rights group"),
				],
				"mattachine",
			),
		).toEqual(["milestone", "venue", "news"]);
	});

	it("leaves a generic word alone even when a milestone title contains it", () => {
		// "rights": 904 milestones but 9,480 news (share 0.08).
		expect(
			order(
				["queer_village", "news", "milestone"],
				[
					sec("queer_village", 1, "Rights Corner"),
					sec("news", 9480, "Rights news"),
					sec("milestone", 904, "UN Human Rights Council passes its first LGBT rights resolution"),
					sec("personality", 268, "A rights activist"),
				],
				"rights",
			)[0],
		).toBe("queer_village");
	});

	it("leaves the lead with a city, country or person the query names", () => {
		for (const [type, title, query] of [
			["city", "Zurich", "zürich"],
			["country", "Germany", "germany"],
			["personality", "Harvey Milk", "harvey milk"],
		] as const) {
			const out = order(
				[type, "milestone"],
				[sec(type, 2, title), sec("milestone", 134, `${title} history milestone`)],
				query,
			);
			expect(out[0]).toBe(type);
		}
	});

	it("needs the History section's first hit to contain the whole query", () => {
		expect(
			order(
				["news", "milestone"],
				[sec("news", 48, "Section 377 ruling"), sec("milestone", 40, "Navtej Singh Johar read down (India)")],
				"section 377",
			)[0],
		).toBe("news");
	});
});

describe("news-heavy history queries lead with History too", () => {
	// Totals and History titles as measured on prod, 2026-11-27.
	const sec = (type: string, total: number, ...titles: string[]) => ({
		type,
		total,
		hits: titles.map((title, i) => ({ type, objectID: `${type}${i}`, title })),
	});
	const lead = (groups: ReturnType<typeof sec>[], query: string) =>
		orderGroups([{ type: groups[0].type }], groups, query)[0].type;

	it("leads with History when news dominates a named historical subject", () => {
		expect(
			lead(
				[
					sec("news", 48, "Delhi HC Revives Plea on Section 377"),
					sec("milestone", 4, "Navtej Singh Johar — Section 377 read down (India)", "Singapore repeals Section 377A"),
					sec("event", 3, "Seduction"),
					sec("venue", 1, "Naz Foundation (Humnawaz)"),
					sec("marketplace", 1, "Seduction"),
					sec("tag", 1, "Seduction"),
				],
				"section 377",
			),
		).toBe("milestone");
		// An acronym counts as a name wherever it sits in the title.
		expect(
			lead(
				[
					sec("news", 86, "ACT UP at 40"),
					sec("milestone", 5, "ACT UP stages its first major demonstration"),
					sec("marketplace", 18, "Silence = Death tee"),
					sec("organization", 3, "ACT UP"),
					sec("venue", 3, "x"),
					sec("event", 3, "x"),
					sec("personality", 2, "x"),
					sec("city", 1, "x"),
					sec("tag", 1, "x"),
				],
				"act up",
			),
		).toBe("milestone");
	});

	it("does not lead with History when the query is a common noun phrase", () => {
		// "The Beaumont Society forms as a trans support group": the words are there, but not as a name.
		expect(
			lead(
				[
					sec("news", 59, "Support groups"),
					sec("milestone", 5, "The Beaumont Society forms as a trans support group"),
					sec("event", 11, "Trans support group"),
					sec("organization", 6, "x"),
					sec("venue", 4, "x"),
					sec("marketplace", 2, "x"),
				],
				"trans support group",
			),
		).toBe("news");
	});

	it("does not lead with History for a broad topic, even one History names", () => {
		// "transgender": 307 History results, too broad to be one historical subject.
		expect(
			lead(
				[
					sec("news", 3974, "Transgender news"),
					sec("milestone", 307, "International Transgender Day of Visibility is established"),
					sec("organization", 201, "x"),
					sec("venue", 162, "x"),
					sec("personality", 133, "x"),
					sec("marketplace", 111, "x"),
					sec("event", 10, "x"),
					sec("tag", 8, "x"),
				],
				"transgender",
			),
		).toBe("news");
	});

	it("does not lead with History when it is a small share of the non-news results", () => {
		// "gras": History is 9 of 86 non-news results (0.10).
		expect(
			lead(
				[
					sec("news", 104, "x"),
					sec("milestone", 9, "Malcolm Turnbull attends the Sydney Mardi Gras"),
					sec("organization", 26, "x"),
					sec("venue", 23, "x"),
					sec("event", 14, "x"),
					sec("city", 5, "x"),
					sec("marketplace", 5, "x"),
					sec("personality", 2, "x"),
					sec("queer_village", 1, "x"),
					sec("country", 1, "x"),
				],
				"gras",
			),
		).toBe("news");
	});

	it("applies only when news is the largest section", () => {
		// Venues lead here, with news close behind: not a news-heavy query.
		expect(
			lead(
				[
					sec("venue", 101, "The Stonewall Inn"),
					sec("news", 100, "x"),
					sec("milestone", 14, "Basel marches to remember Stonewall"),
				],
				"stonewall",
			),
		).toBe("venue");
	});

	it("does not count a capital that only starts the title", () => {
		// Every title starts with a capital: "Gay bar Yanagi opens" does not name a "gay bar".
		expect(
			lead(
				[
					sec("news", 225, "x"),
					sec("milestone", 9, "Gay bar Yanagi opens in Japan"),
					sec("organization", 40, "x"),
					sec("event", 20, "x"),
				],
				"gay bar",
			),
		).toBe("news");
	});
});

