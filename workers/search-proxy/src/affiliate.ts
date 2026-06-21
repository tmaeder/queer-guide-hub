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
 * GET /go?u=<dest>&p=<partner>&s=<surface>&v=<vertical>&e=<type:id>
 * Applies sub-id, logs the click (service role), 302s to the tagged URL.
 */
export async function handleGo(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);
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
