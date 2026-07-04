import { describe, it, expect, vi, afterEach } from "vitest";
import { pgHybridSearch, pgAutocomplete } from "../src/pgSearch";
import type { Env } from "../src/index";

/**
 * Unit tests for the Postgres search backend mappers. They mock the PostgREST fetch and
 * assert the search_hybrid / search_autocomplete JSON is mapped into the exact
 * shape the rest of the Worker (fuse/rank/response, /autocomplete) expects.
 */

const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "k" } as unknown as Env;

/** Mock global.fetch, routing by the RPC name in the URL. */
function mockRpc(routes: Record<string, unknown>, failing: string[] = []) {
	return vi.fn(async (url: string) => {
		const fn = String(url).split("/rpc/")[1];
		if (failing.includes(fn)) return { ok: false, status: 500, text: async () => "boom" } as unknown as Response;
		return { ok: true, json: async () => routes[fn] } as unknown as Response;
	});
}

afterEach(() => vi.restoreAllMocks());

describe("pgHybridSearch", () => {
	it("maps a search_hybrid hit into the Worker hit shape", async () => {
		const hit = {
			objectID: "v1", type: "venue", title: "Berghain", description: "club", category: "Club",
			city: "Berlin", country: "DE", slug: "berghain", imageUrl: "img.jpg", featured: true,
			is_free: false, _geoloc: { lat: 52.5, lng: 13.4 }, _rankingScore: 0.42, _distance_m: 120,
			trust_score: 88, liveness_status: "live", tags: ["techno"],
		};
		global.fetch = mockRpc({ search_hybrid: { total: 7, hits: [hit] }, search_facets: { type: { venue: 7 } } }) as never;

		const r = await pgHybridSearch(env, { query: "berghain", hitsPerPage: 20, page: 0 });

		expect(r.estimatedTotalHits).toBe(7);
		expect(r.facetDistribution).toEqual({ type: { venue: 7 } });
		expect(r.hits).toHaveLength(1);
		const m = r.hits[0];
		expect(m.id).toBe("v1");
		expect(m.objectID).toBe("v1");
		expect(m.type).toBe("venue");
		expect(m.content_type).toBe("venue");
		expect(m.name).toBe("Berghain"); // title mirrored to name
		expect(m.image_url).toBe("img.jpg");
		expect(m._geoloc).toEqual({ lat: 52.5, lng: 13.4 });
		expect(m.featured).toBe(true);
		expect(m._source).toBe("pg");
		expect(m._rankingScore).toBe(0.42);
		expect(m._fused).toBe(0.42); // personalizedRank layers boosts on top of _fused
	});

	it("computes offset from page and passes hitsPerPage as limit", async () => {
		const fetchSpy = mockRpc({ search_hybrid: { total: 0, hits: [] }, search_facets: {} });
		global.fetch = fetchSpy as never;
		await pgHybridSearch(env, { query: "x", hitsPerPage: 20, page: 2 });
		const body = JSON.parse((fetchSpy.mock.calls.find((c) => String(c[0]).includes("search_hybrid"))![1] as RequestInit).body as string);
		expect(body.p_limit).toBe(20);
		expect(body.p_offset).toBe(40); // page 2 * 20
	});

	it("fails soft to empty facets when search_facets errors", async () => {
		global.fetch = mockRpc({ search_hybrid: { total: 1, hits: [{ objectID: "a", type: "venue" }] } }, ["search_facets"]) as never;
		const r = await pgHybridSearch(env, { query: "x", hitsPerPage: 10, page: 0 });
		expect(r.facetDistribution).toEqual({});
		expect(r.hits).toHaveLength(1);
	});
});

describe("pgAutocomplete", () => {
	it("maps rows to suggestions (title_formatted is null on the pg path)", async () => {
		const rows = [
			{ objectID: "v1", type: "venue", title: "Berghain", city: "Berlin", country: "DE", slug: "berghain", imageUrl: "https://ext/raw.jpg", optimizedUrl: "https://r2/opt.webp", thumbnailUrl: "https://r2/thumb.webp" },
		];
		global.fetch = mockRpc({ search_autocomplete: rows }) as never;
		const s = await pgAutocomplete(env, "berg", ["venue"], 8);
		expect(s).toEqual([
			{ id: "v1", type: "venue", title: "Berghain", title_formatted: null, city: "Berlin", country: "DE", slug: "berghain", image_url: "https://ext/raw.jpg", optimized_url: "https://r2/opt.webp", thumbnail_url: "https://r2/thumb.webp" },
		]);
	});

	it("passes null content types through unchanged and returns [] on no rows", async () => {
		const fetchSpy = mockRpc({ search_autocomplete: [] });
		global.fetch = fetchSpy as never;
		const s = await pgAutocomplete(env, "zzz", null, 6);
		expect(s).toEqual([]);
		const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
		expect(body.p_content_types).toBeNull();
		expect(body.p_prefix).toBe("zzz");
	});
});
