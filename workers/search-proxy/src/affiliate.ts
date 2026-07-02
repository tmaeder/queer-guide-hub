/**
 * First-party affiliate redirect (`/go`).
 *
 * Mirrors the frontend lib/affiliate registry. Kept as a small standalone
 * copy because the worker is a separate package — the host allowlist here is
 * also the open-redirect guard, so it is deliberately explicit.
 */

import type { Env } from "./index";

type SubField = "sub_id" | "booking_label" | "gyg_placement";

interface Partner {
	name: string;
	vertical: string;
	subField: SubField;
	host: string;
}

// host (registrable, no scheme) → partner. Also the redirect allowlist.
const PARTNERS: Record<string, Partner> = {
	aviasales: { name: "Aviasales", vertical: "flight", subField: "sub_id", host: "aviasales.com" },
	booking: { name: "Booking.com", vertical: "hotel", subField: "booking_label", host: "booking.com" },
	hotellook: { name: "Hotellook", vertical: "hotel", subField: "sub_id", host: "hotellook.com" },
	hotelscom: { name: "Hotels.com", vertical: "hotel", subField: "sub_id", host: "hotels.com" },
	getyourguide: { name: "GetYourGuide", vertical: "activity", subField: "gyg_placement", host: "getyourguide.com" },
	discovercars: { name: "DiscoverCars", vertical: "car", subField: "sub_id", host: "discovercars.com" },
	kiwitaxi: { name: "Kiwitaxi", vertical: "transfer", subField: "sub_id", host: "kiwitaxi.com" },
	airalo: { name: "Airalo", vertical: "esim", subField: "sub_id", host: "airalo.com" },
	heymondo: { name: "Heymondo", vertical: "insurance", subField: "sub_id", host: "heymondo.com" },
	compensair: { name: "Compensair", vertical: "other", subField: "sub_id", host: "compensair.com" },
	// tp.media is the Travelpayouts redirect host — allowed as a pass-through.
	tpmedia: { name: "Travelpayouts", vertical: "other", subField: "sub_id", host: "tp.media" },
};

const ALLOWED_HOSTS = new Set(Object.values(PARTNERS).map((p) => p.host));

const SURFACES = new Set([
	"venue", "event", "city", "country", "news", "personality", "hotel",
	"hotel_list", "trip", "trip_suggest", "map", "marketplace", "esim",
	"insurance", "transfer",
	// shopping (marketplace listing) surfaces — /go?l= mode
	"marketplace_grid", "marketplace_detail", "brand_page", "city_rail",
	"trip_packing", "event_rail", "for_you", "wishlist",
]);

const BOOKING_LABEL_BASE = "queerguide-452012";

function hostAllowed(host: string): boolean {
	const h = host.replace(/^www\./, "");
	for (const allowed of ALLOWED_HOSTS) {
		if (h === allowed || h.endsWith(`.${allowed}`)) return true;
	}
	return false;
}

function applySubId(rawUrl: string, partnerKey: string, surface: string): string {
	const partner = PARTNERS[partnerKey];
	if (!partner) return rawUrl;
	try {
		const url = new URL(rawUrl);
		switch (partner.subField) {
			case "sub_id":
				url.searchParams.set("sub_id", surface);
				break;
			case "gyg_placement":
				url.searchParams.set("placement", surface);
				break;
			case "booking_label":
				url.searchParams.set("label", `${BOOKING_LABEL_BASE}-${surface}`);
				break;
		}
		return url.toString();
	} catch {
		return rawUrl;
	}
}

/**
 * GET /go?u=<dest>&p=<partner>&s=<surface>&v=<vertical>&e=<type:id>   (travel)
 * GET /go?l=<listing_id>&s=<surface>[&beacon=1]                       (shopping)
 * Applies sub-id, logs the click (service role), 302s to the tagged URL.
 */
export async function handleGo(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);
	if (url.searchParams.get("l")) {
		return handleMarketplaceGo(request, env, ctx);
	}
	const dest = url.searchParams.get("u") ?? "";
	const partner = url.searchParams.get("p") ?? "";
	const surface = url.searchParams.get("s") ?? "";
	const vertical = url.searchParams.get("v") ?? PARTNERS[partner]?.vertical ?? "other";
	const entity = url.searchParams.get("e") ?? "";

	// Validate destination — open-redirect guard.
	let destUrl: URL;
	try {
		destUrl = new URL(dest);
	} catch {
		return new Response("bad destination", { status: 400 });
	}
	if (destUrl.protocol !== "https:" && destUrl.protocol !== "http:") {
		return new Response("bad scheme", { status: 400 });
	}
	if (!hostAllowed(destUrl.hostname)) {
		return new Response("destination not allowed", { status: 400 });
	}
	if (!PARTNERS[partner] || !SURFACES.has(surface)) {
		return new Response("bad partner/surface", { status: 400 });
	}

	const tagged = applySubId(dest, partner, surface);

	// beacon=1 → log a viewport impression and return 204 (no redirect).
	// Lets BookCTA record impressions for CTR without a client-write RLS hole.
	const isBeacon = url.searchParams.get("beacon") === "1";

	// Skip logging obvious bots; never block the redirect on logging.
	const ua = request.headers.get("user-agent") ?? "";
	const isBot = /bot|crawl|spider|preview|facebookexternalhit|slurp/i.test(ua);
	if (!isBot) {
		const [entityType, entityId] = entity.includes(":") ? entity.split(":", 2) : [null, null];
		ctx.waitUntil(logClick(env, {
			surface,
			partner,
			vertical,
			sub_id: surface,
			entity_type: entityType,
			entity_id: entityId,
			destination_url: tagged,
			kind: isBeacon ? "impression" : "click",
		}));
	}

	if (isBeacon) {
		return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
	}

	return new Response(null, {
		status: 302,
		headers: { Location: tagged, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
	});
}

// ── Marketplace mode (/go?l=) ────────────────────────────────────
//
// Destination comes from the DB row, never from the query string, so the
// open-redirect allowlist problem doesn't apply to 17k merchant domains.

interface MarketplaceListingRow {
	id: string;
	affiliate_url: string | null;
	external_url: string | null;
	website: string | null;
	source_type: string | null;
	merchant_domain: string | null;
	status: string | null;
}

const LISTING_CACHE_TTL = 3600;

async function fetchListing(env: Env, id: string): Promise<MarketplaceListingRow | null> {
	const cacheKey = new Request(`https://listing-cache.internal/${id}`);
	const cache = caches.default;
	const cached = await cache.match(cacheKey);
	if (cached) return (await cached.json()) as MarketplaceListingRow | null;

	const cols = "id,affiliate_url,external_url,website,source_type,merchant_domain,status";
	const res = await fetch(
		`${env.SUPABASE_URL}/rest/v1/marketplace_listings?id=eq.${encodeURIComponent(id)}&select=${cols}&limit=1`,
		{
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			},
		},
	);
	if (!res.ok) return null;
	const rows = (await res.json()) as MarketplaceListingRow[];
	const row = rows[0] ?? null;
	await cache.put(
		cacheKey,
		new Response(JSON.stringify(row), {
			headers: { "Cache-Control": `max-age=${LISTING_CACHE_TTL}`, "Content-Type": "application/json" },
		}),
	);
	return row;
}

/** Wrap a merchant URL in an Awin cread link when we know the merchant's MID. */
function awinWrap(merchantUrl: string, merchantDomain: string | null, env: Env, surface: string): string | null {
	if (!env.AWIN_AFFILIATE_ID || !env.AWIN_MERCHANT_MIDS || !merchantDomain) return null;
	let mids: Record<string, string>;
	try {
		mids = JSON.parse(env.AWIN_MERCHANT_MIDS) as Record<string, string>;
	} catch {
		return null;
	}
	const mid = mids[merchantDomain.replace(/^www\./, "")];
	if (!mid) return null;
	return `https://www.awin1.com/cread.php?awinmid=${mid}&awinaffid=${env.AWIN_AFFILIATE_ID}&clickref=${encodeURIComponent(surface)}&ued=${encodeURIComponent(merchantUrl)}`;
}

/** Apply per-network click attribution to an outbound shopping URL. */
function tagShoppingUrl(raw: string, env: Env, surface: string): string {
	try {
		const u = new URL(raw);
		const host = u.hostname.replace(/^www\./, "");
		if (host === "awin1.com" || host.endsWith(".awin1.com")) {
			u.searchParams.set("clickref", surface);
		} else if (/(^|\.)amazon\.[a-z.]+$/.test(host) && env.AMAZON_ASSOCIATES_TAG) {
			u.searchParams.set("tag", env.AMAZON_ASSOCIATES_TAG);
		}
		return u.toString();
	} catch {
		return raw;
	}
}

async function handleMarketplaceGo(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);
	const listingId = url.searchParams.get("l") ?? "";
	const surface = url.searchParams.get("s") ?? "marketplace_grid";

	const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRe.test(listingId) || !SURFACES.has(surface)) {
		return new Response("bad listing/surface", { status: 400 });
	}

	const isBeacon = url.searchParams.get("beacon") === "1";
	const listing = await fetchListing(env, listingId);
	if (!listing) return new Response("listing not found", { status: 404 });

	const base =
		listing.affiliate_url ??
		(listing.external_url ? awinWrap(listing.external_url, listing.merchant_domain, env, surface) : null) ??
		listing.external_url ??
		listing.website;
	if (!base) return new Response("listing has no destination", { status: 404 });
	let destUrl: URL;
	try {
		destUrl = new URL(base);
	} catch {
		return new Response("bad destination", { status: 404 });
	}
	if (destUrl.protocol !== "https:" && destUrl.protocol !== "http:") {
		return new Response("bad destination", { status: 404 });
	}
	const tagged = tagShoppingUrl(destUrl.toString(), env, surface);

	const ua = request.headers.get("user-agent") ?? "";
	const isBot = /bot|crawl|spider|preview|facebookexternalhit|slurp/i.test(ua);
	if (!isBot) {
		ctx.waitUntil(logClick(env, {
			surface,
			partner: `mkt:${listing.source_type ?? "direct"}`,
			vertical: "shopping",
			sub_id: surface,
			entity_type: "marketplace_listing",
			entity_id: listingId,
			destination_url: tagged,
			kind: isBeacon ? "impression" : "click",
		}));
	}

	if (isBeacon) {
		return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
	}
	return new Response(null, {
		status: 302,
		headers: { Location: tagged, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
	});
}

async function logClick(
	env: Env,
	row: {
		surface: string;
		partner: string;
		vertical: string;
		sub_id: string;
		entity_type: string | null;
		entity_id: string | null;
		destination_url: string;
		kind: "click" | "impression";
	},
): Promise<void> {
	try {
		// entity_id is a uuid column — drop non-uuid ids so a bad value can't 400 the insert.
		const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		const safeRow = {
			...row,
			entity_id: row.entity_id && uuidRe.test(row.entity_id) ? row.entity_id : null,
			entity_type: row.entity_id && uuidRe.test(row.entity_id) ? row.entity_type : null,
		};
		await fetch(`${env.SUPABASE_URL}/rest/v1/affiliate_clicks`, {
			method: "POST",
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
				"Content-Type": "application/json",
				Prefer: "return=minimal",
			},
			body: JSON.stringify(safeRow),
		});
	} catch {
		// Best-effort — analytics must never break the redirect.
	}
}
