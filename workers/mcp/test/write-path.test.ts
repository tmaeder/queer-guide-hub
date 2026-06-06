import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { insertSubmission, saveFavorite, addTripPlace, createTrip, type TokenHolder } from "../src/supabase";

// Minimal holder: only the fields the write helpers read.
const holder = {
	env: { SUPABASE_URL: "https://sb.test", SUPABASE_ANON_KEY: "anon-key" },
	props: { supabaseAccessToken: "user-jwt", userId: "u1" },
} as unknown as TokenHolder;

let calls: Array<{ url: string; init: RequestInit }>;

function mockOk(body: unknown) {
	return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
	});
}

function lastBody(): unknown {
	return JSON.parse(String(calls.at(-1)!.init.body));
}
function lastHeaders(): Record<string, string> {
	return (calls.at(-1)!.init.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
	calls = [];
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe("write helpers hit the right table with the user JWT (RLS)", () => {
	it("saveFavorite maps each type to its table + id column", async () => {
		vi.stubGlobal("fetch", mockOk([{ id: "fav1" }]));
		await saveFavorite(holder, "u1", "marketplace", "L1");
		expect(calls.at(-1)!.url).toBe("https://sb.test/rest/v1/marketplace_favorites");
		expect(lastBody()).toEqual([{ user_id: "u1", listing_id: "L1" }]);
		const h = lastHeaders();
		expect(h.Authorization).toBe("Bearer user-jwt"); // RLS authorizes via user JWT
		expect(h.apikey).toBe("anon-key"); // never the service key
	});

	it("addTripPlace picks the correct id column per entity type", async () => {
		vi.stubGlobal("fetch", mockOk([{ id: "tp1" }]));
		await addTripPlace(holder, "u1", { trip_id: "T1", entity_type: "event", entity_id: "E1" });
		expect(calls.at(-1)!.url).toBe("https://sb.test/rest/v1/trip_places");
		expect(lastBody()).toEqual([{ trip_id: "T1", event_id: "E1", notes: null, created_by: "u1" }]);

		await addTripPlace(holder, "u1", { trip_id: "T1", entity_type: "hotel", entity_id: "H1" });
		expect(lastBody()).toEqual([{ trip_id: "T1", hotel_id: "H1", notes: null, created_by: "u1" }]);
	});

	it("createTrip sends owner_id + required primary_city_id", async () => {
		vi.stubGlobal("fetch", mockOk([{ id: "trip1", title: "Berlin" }]));
		const r = await createTrip(holder, "u1", { title: "Berlin", primary_city_id: "C1" });
		expect(r).toEqual({ id: "trip1", title: "Berlin" });
		const body = lastBody() as Array<Record<string, unknown>>;
		expect(body[0]).toMatchObject({ owner_id: "u1", title: "Berlin", primary_city_id: "C1" });
	});

	it("insertSubmission builds a community_submissions row through the pipeline", async () => {
		vi.stubGlobal("fetch", mockOk([{ id: "s1", status: "pending" }]));
		const r = await insertSubmission(holder, "u1", {
			entity_type: "venue",
			source_url: "https://example.com",
			raw_data: { name: "Bar", images: ["https://img/1.jpg"] },
		});
		expect(r).toEqual({ id: "s1", status: "pending" });
		expect(calls.at(-1)!.url).toBe("https://sb.test/rest/v1/community_submissions");
		const row = (lastBody() as Array<Record<string, unknown>>)[0];
		expect(row).toMatchObject({
			content_type: "venue",
			status: "pending",
			submitted_by: "u1",
			source_url: "https://example.com",
			sub_source_type: "api",
			platform: "manual",
			media_processing_status: "pending", // images present
		});
		expect(row.media_urls).toEqual(["https://img/1.jpg"]);
	});

	it("insertSubmission marks no media when there are no images", async () => {
		vi.stubGlobal("fetch", mockOk([{ id: "s2", status: "pending" }]));
		await insertSubmission(holder, "u1", {
			entity_type: "event",
			source_url: "https://example.com",
			raw_data: { title: "Party" },
		});
		const row = (lastBody() as Array<Record<string, unknown>>)[0];
		expect(row.content_type).toBe("event");
		expect(row.media_urls).toBeNull();
		expect(row.media_processing_status).toBe("not_applicable");
	});

	it("throws for an unsupported favorite type", async () => {
		vi.stubGlobal("fetch", mockOk([]));
		await expect(saveFavorite(holder, "u1", "city", "X")).rejects.toThrow(/not supported/);
	});
});
