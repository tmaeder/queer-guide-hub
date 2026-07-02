import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleGo } from "../src/affiliate";
import type { Env } from "../src/index";

const LISTING_ID = "11111111-2222-3333-4444-555555555555";

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

let listingRow: Record<string, unknown> | null;
let restCalls: string[];
let clickBodies: Array<Record<string, unknown>>;

beforeEach(() => {
	listingRow = {
		id: LISTING_ID,
		affiliate_url: "https://www.awin1.com/cread.php?awinmid=99&awinaffid=1&ued=https%3A%2F%2Fshop.com%2Fp",
		external_url: "https://shop.com/p",
		website: null,
		source_type: "awin",
		merchant_domain: "shop.com",
		status: "active",
	};
	restCalls = [];
	clickBodies = [];

	// No Cache API in node — always miss.
	(globalThis as Record<string, unknown>).caches = {
		default: { match: async () => undefined, put: async () => undefined },
	};

	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		restCalls.push(url);
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

describe("handleGo marketplace mode (/go?l=)", () => {
	it("302s to the affiliate_url with clickref=surface and logs a shopping click", async () => {
		const ctx = makeCtx();
		const res = await handleGo(goRequest(`l=${LISTING_ID}&s=marketplace_detail`), makeEnv(), ctx);
		expect(res.status).toBe(302);
		const loc = new URL(res.headers.get("Location")!);
		expect(loc.hostname).toBe("www.awin1.com");
		expect(loc.searchParams.get("clickref")).toBe("marketplace_detail");

		// waitUntil received the click log promise
		const waited = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		await Promise.all(waited);
		expect(clickBodies).toHaveLength(1);
		expect(clickBodies[0]).toMatchObject({
			surface: "marketplace_detail",
			partner: "mkt:awin",
			vertical: "shopping",
			entity_type: "marketplace_listing",
			entity_id: LISTING_ID,
			kind: "click",
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
	});

	it("beacon=1 logs an impression and returns 204", async () => {
		const ctx = makeCtx();
		const res = await handleGo(goRequest(`l=${LISTING_ID}&s=trip_packing&beacon=1`), makeEnv(), ctx);
		expect(res.status).toBe(204);
		const waited = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
		await Promise.all(waited);
		expect(clickBodies[0]).toMatchObject({ kind: "impression", surface: "trip_packing" });
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
