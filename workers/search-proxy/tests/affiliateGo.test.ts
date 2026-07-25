import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleGo, handleGoRegistry } from "../src/affiliate";
import { resetPartnerMemo, FALLBACK_PARTNERS } from "../src/partnerRegistry";
import type { Env } from "../src/index";

const LISTING_ID = "11111111-2222-3333-4444-555555555555";
const CODE_RE = /^[0-9a-f]{12}$/;

function makeEnv(overrides: Partial<Env> = {}): Env {
	return {
		SUPABASE_URL: "https://db.example.com",
		SUPABASE_SERVICE_KEY: "service-key",
		...overrides,
	} as Env;
}

function makeCtx(): ExecutionContext {
	return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function goRequest(qs: string): Request {
	return new Request(`https://search.queer.guide/go?${qs}`, {
		headers: { "user-agent": "Mozilla/5.0" },
	});
}

async function flushClicks(ctx: ExecutionContext): Promise<void> {
	const waited = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
	await Promise.all(waited);
}

let listingRow: Record<string, unknown> | null;
let partnerRows: Array<Record<string, unknown>> | null; // null → 500 from PostgREST
let restCalls: string[];
let clickBodies: Array<Record<string, unknown>>;

beforeEach(() => {
	resetPartnerMemo();
	listingRow = {
		id: LISTING_ID,
		affiliate_url: "https://www.awin1.com/cread.php?awinmid=99&awinaffid=1&ued=https%3A%2F%2Fshop.com%2Fp",
		external_url: "https://shop.com/p",
		website: null,
		source_type: "awin",
		merchant_domain: "shop.com",
		status: "active",
	};
	partnerRows = null;
	restCalls = [];
	clickBodies = [];

	// No Cache API in node — always miss.
	(globalThis as Record<string, unknown>).caches = {
		default: { match: async () => undefined, put: async () => undefined },
	};

	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		restCalls.push(url);
		if (url.includes("/rest/v1/affiliate_partners")) {
			if (partnerRows === null) return new Response("boom", { status: 500 });
			return new Response(JSON.stringify(partnerRows), { status: 200 });
		}
		if (url.includes("/rest/v1/marketplace_listings")) {
			return new Response(JSON.stringify(listingRow ? [listingRow] : []), { status: 200 });
		}
		if (url.includes("/rest/v1/affiliate_clicks")) {
			clickBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return new Response(null, { status: 201 });
		}
		return new Response("not found", { status: 404 });
	}) as typeof fetch;
});

describe("partner registry", () => {
	it("loads partners from the DB and serves them", async () => {
		partnerRows = [
			{ go_key: "newpartner", partner_name: "New Partner", vertical: "hotel", sub_field: "sub_id", domains: ["newpartner.example"] },
		];
		const res = await handleGo(
			goRequest(`u=${encodeURIComponent("https://newpartner.example/x")}&p=newpartner&s=hotel`),
			makeEnv(),
			makeCtx(),
		);
		expect(res.status).toBe(302);
		const loc = new URL(res.headers.get("Location")!);
		expect(loc.searchParams.get("sub_id")).toMatch(/^hotel\.[0-9a-f]{12}$/);
	});

	it("fails open to the baked-in map when the registry fetch 500s", async () => {
		partnerRows = null; // PostgREST error
		const res = await handleGo(
			goRequest(`u=${encodeURIComponent("https://www.aviasales.com/search")}&p=aviasales&s=trip`),
			makeEnv(),
			makeCtx(),
		);
		expect(res.status).toBe(302);
		const reg = await (await handleGoRegistry(makeEnv())).json() as { source: string; keys: string[] };
		expect(reg.source).toBe("fallback");
		expect(reg.keys).toContain("booking");
	});

	it("keeps fallback hosts in the allowlist even when the DB registry loads", async () => {
		partnerRows = [
			{ go_key: "booking", partner_name: "Booking.com", vertical: "hotel", sub_field: "booking_label", domains: ["booking.com"] },
		];
		// aviasales.com is not in the DB rows, but must stay allowed (fallback union).
		const res = await handleGo(
			goRequest(`u=${encodeURIComponent("https://www.aviasales.com/search")}&p=booking&s=trip`),
			makeEnv(),
			makeCtx(),
		);
		expect(res.status).toBe(302);
	});

	it("still rejects hosts on no allowlist", async () => {
		partnerRows = [
			{ go_key: "booking", partner_name: "Booking.com", vertical: "hotel", sub_field: "booking_label", domains: ["booking.com"] },
		];
		const res = await handleGo(
			goRequest(`u=${encodeURIComponent("https://evil.example/phish")}&p=booking&s=trip`),
			makeEnv(),
			makeCtx(),
		);
		expect(res.status).toBe(400);
	});

	it("/go/registry reports db source and keys", async () => {
		partnerRows = [
			{ go_key: "booking", partner_name: "Booking.com", vertical: "hotel", sub_field: "booking_label", domains: ["booking.com"] },
		];
		const reg = await (await handleGoRegistry(makeEnv())).json() as { source: string; keys: string[] };
		expect(reg.source).toBe("db");
		expect(reg.keys).toEqual(["booking"]);
	});
});

describe("handleGo travel mode (/go?u=)", () => {
	it("appends a per-click code to sub_id and logs it", async () => {
		const ctx = makeCtx();
		const res = await handleGo(
			goRequest(`u=${encodeURIComponent("https://www.aviasales.com/search")}&p=aviasales&s=trip`),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(302);
		const loc = new URL(res.headers.get("Location")!);
		const subId = loc.searchParams.get("sub_id")!;
		const [surfacePart, codePart] = subId.split(".");
		expect(surfacePart).toBe("trip");
		expect(codePart).toMatch(CODE_RE);

		await flushClicks(ctx);
		expect(clickBodies).toHaveLength(1);
		expect(clickBodies[0]).toMatchObject({ partner: "aviasales", kind: "click", sub_id: subId, click_code: codePart });
	});

	it("appends the code to the Booking label", async () => {
		const res = await handleGo(
			goRequest(`u=${encodeURIComponent("https://www.booking.com/hotel/x")}&p=booking&s=venue`),
			makeEnv(),
			makeCtx(),
		);
		const loc = new URL(res.headers.get("Location")!);
		expect(loc.searchParams.get("label")).toMatch(/^queerguide-452012-venue-[0-9a-f]{12}$/);
	});

	it("keeps GYG placement code-free", async () => {
		const res = await handleGo(
			goRequest(`u=${encodeURIComponent("https://www.getyourguide.com/x")}&p=getyourguide&s=city`),
			makeEnv(),
			makeCtx(),
		);
		const loc = new URL(res.headers.get("Location")!);
		expect(loc.searchParams.get("placement")).toBe("city");
	});

	it("beacon impressions carry no click code", async () => {
		const ctx = makeCtx();
		const res = await handleGo(
			goRequest(`u=${encodeURIComponent("https://www.aviasales.com/search")}&p=aviasales&s=trip&beacon=1`),
			makeEnv(),
			ctx,
		);
		expect(res.status).toBe(204);
		await flushClicks(ctx);
		expect(clickBodies[0]).toMatchObject({ kind: "impression", sub_id: "trip", click_code: null });
	});
});

describe("handleGo marketplace mode (/go?l=)", () => {
	it("302s to the affiliate_url with clickref=surface.code and logs a shopping click", async () => {
		const ctx = makeCtx();
		const res = await handleGo(goRequest(`l=${LISTING_ID}&s=marketplace_detail`), makeEnv(), ctx);
		expect(res.status).toBe(302);
		const loc = new URL(res.headers.get("Location")!);
		expect(loc.hostname).toBe("www.awin1.com");
		const clickref = loc.searchParams.get("clickref")!;
		const [surfacePart, codePart] = clickref.split(".");
		expect(surfacePart).toBe("marketplace_detail");
		expect(codePart).toMatch(CODE_RE);

		await flushClicks(ctx);
		expect(clickBodies).toHaveLength(1);
		expect(clickBodies[0]).toMatchObject({
			surface: "marketplace_detail",
			partner: "mkt:awin",
			vertical: "shopping",
			entity_type: "marketplace_listing",
			entity_id: LISTING_ID,
			kind: "click",
			click_code: codePart,
		});
	});

	it("falls back to external_url and applies the Amazon tag", async () => {
		listingRow = {
			...listingRow,
			affiliate_url: null,
			external_url: "https://www.amazon.de/dp/B000?ref=x",
			source_type: "amazon",
			merchant_domain: "amazon.de",
		};
		const res = await handleGo(
			goRequest(`l=${LISTING_ID}&s=marketplace_grid`),
			makeEnv({ AMAZON_ASSOCIATES_TAG: "queerguide-21" }),
			makeCtx(),
		);
		expect(res.status).toBe(302);
		const loc = new URL(res.headers.get("Location")!);
		expect(loc.searchParams.get("tag")).toBe("queerguide-21");
	});

	it("wraps a bare merchant URL in Awin cread when the MID is known", async () => {
		listingRow = { ...listingRow, affiliate_url: null, external_url: "https://etsy.com/listing/1", merchant_domain: "etsy.com" };
		const res = await handleGo(
			goRequest(`l=${LISTING_ID}&s=brand_page`),
			makeEnv({ AWIN_AFFILIATE_ID: "777", AWIN_MERCHANT_MIDS: '{"etsy.com":"12345"}' }),
			makeCtx(),
		);
		const loc = new URL(res.headers.get("Location")!);
		expect(loc.hostname).toBe("www.awin1.com");
		expect(loc.searchParams.get("awinmid")).toBe("12345");
		expect(loc.searchParams.get("awinaffid")).toBe("777");
		expect(loc.searchParams.get("ued")).toBe("https://etsy.com/listing/1");
		expect(loc.searchParams.get("clickref")).toMatch(/^brand_page\.[0-9a-f]{12}$/);
	});

	it("beacon=1 logs an impression (no code) and returns 204", async () => {
		const ctx = makeCtx();
		const res = await handleGo(goRequest(`l=${LISTING_ID}&s=trip_packing&beacon=1`), makeEnv(), ctx);
		expect(res.status).toBe(204);
		await flushClicks(ctx);
		expect(clickBodies[0]).toMatchObject({ kind: "impression", surface: "trip_packing", click_code: null });
	});

	it("rejects non-uuid listing ids and unknown surfaces", async () => {
		expect((await handleGo(goRequest("l=abc&s=marketplace_grid"), makeEnv(), makeCtx())).status).toBe(400);
		expect((await handleGo(goRequest(`l=${LISTING_ID}&s=evil`), makeEnv(), makeCtx())).status).toBe(400);
	});

	it("404s when the listing does not exist or has no destination", async () => {
		listingRow = null;
		expect((await handleGo(goRequest(`l=${LISTING_ID}&s=marketplace_grid`), makeEnv(), makeCtx())).status).toBe(404);
		listingRow = { id: LISTING_ID, affiliate_url: null, external_url: null, website: null, source_type: "awin", merchant_domain: null, status: "active" };
		expect((await handleGo(goRequest(`l=${LISTING_ID}&s=marketplace_grid`), makeEnv(), makeCtx())).status).toBe(404);
	});
});

describe("registry drift", () => {
	it("frontend PARTNERS keys are a subset of the worker fallback", async () => {
		// The frontend registry lives in src/lib/affiliate/config.ts of the app
		// package; the worker fallback must cover every key the app can emit.
		const expectedFrontendKeys = [
			"aviasales", "booking", "hotellook", "hotelscom", "getyourguide",
			"discovercars", "kiwitaxi", "airalo", "heymondo", "compensair", "tpmedia",
		];
		for (const key of expectedFrontendKeys) {
			expect(FALLBACK_PARTNERS[key], `missing fallback partner: ${key}`).toBeDefined();
		}
	});
});
