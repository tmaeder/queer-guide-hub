/**
 * DB-driven affiliate partner registry.
 *
 * `affiliate_partners` rows with `enabled AND go_key IS NOT NULL` drive the
 * /go redirect: partner key, vertical, sub-id field and the host allowlist
 * (domains[]). Loaded with three layers — module memo (5 min) → Cache API
 * (1 h) → PostgREST — and FAIL-OPEN to the baked-in map below on any error:
 * the redirect must never break because the DB blinked.
 *
 * The fallback hosts stay in the allowlist even when the DB loads, so a
 * bad registry edit cannot cut off a live partner mid-flight.
 */

import type { Env } from "./index";

export type SubField = "sub_id" | "booking_label" | "gyg_placement";

export interface Partner {
	name: string;
	vertical: string;
	subField: SubField;
	hosts: string[];
}

export interface PartnerRegistry {
	partners: Record<string, Partner>;
	allowedHosts: Set<string>;
	source: "db" | "fallback";
	fetchedAt: string;
}

// host (registrable, no scheme) → partner. Mirrored in affiliate_partners
// (go_key/sub_field/domains, migration 20260726090000) — the DB wins when
// reachable; this map is the fail-open floor.
export const FALLBACK_PARTNERS: Record<string, Partner> = {
	aviasales: { name: "Aviasales", vertical: "flight", subField: "sub_id", hosts: ["aviasales.com"] },
	booking: { name: "Booking.com", vertical: "hotel", subField: "booking_label", hosts: ["booking.com"] },
	hotellook: { name: "Hotellook", vertical: "hotel", subField: "sub_id", hosts: ["hotellook.com"] },
	hotelscom: { name: "Hotels.com", vertical: "hotel", subField: "sub_id", hosts: ["hotels.com"] },
	getyourguide: { name: "GetYourGuide", vertical: "activity", subField: "gyg_placement", hosts: ["getyourguide.com"] },
	discovercars: { name: "DiscoverCars", vertical: "car", subField: "sub_id", hosts: ["discovercars.com"] },
	kiwitaxi: { name: "Kiwitaxi", vertical: "transfer", subField: "sub_id", hosts: ["kiwitaxi.com"] },
	airalo: { name: "Airalo", vertical: "esim", subField: "sub_id", hosts: ["airalo.com"] },
	heymondo: { name: "Heymondo", vertical: "insurance", subField: "sub_id", hosts: ["heymondo.com"] },
	compensair: { name: "Compensair", vertical: "other", subField: "sub_id", hosts: ["compensair.com"] },
	// tp.media is the Travelpayouts redirect host — allowed as a pass-through.
	tpmedia: { name: "Travelpayouts", vertical: "other", subField: "sub_id", hosts: ["tp.media"] },
};

const MEMO_TTL_MS = 300_000;
const EDGE_CACHE_TTL_S = 3600;
const CACHE_KEY = "https://partner-registry.internal/v1";

interface PartnerRow {
	go_key: string;
	partner_name: string;
	vertical: string | null;
	sub_field: string | null;
	domains: string[] | null;
}

const SUB_FIELDS = new Set<SubField>(["sub_id", "booking_label", "gyg_placement"]);

let memo: { registry: PartnerRegistry; at: number } | null = null;

function buildRegistry(rows: PartnerRow[]): PartnerRegistry {
	const partners: Record<string, Partner> = {};
	for (const row of rows) {
		if (!row.go_key) continue;
		partners[row.go_key] = {
			name: row.partner_name,
			vertical: row.vertical ?? "other",
			subField: SUB_FIELDS.has(row.sub_field as SubField) ? (row.sub_field as SubField) : "sub_id",
			hosts: (row.domains ?? []).map((d) => d.replace(/^www\./, "")).filter(Boolean),
		};
	}
	return {
		partners,
		allowedHosts: collectHosts(partners),
		source: "db",
		fetchedAt: new Date().toISOString(),
	};
}

function collectHosts(partners: Record<string, Partner>): Set<string> {
	// Union with the fallback hosts — a registry edit must not orphan live links.
	const hosts = new Set<string>();
	for (const p of Object.values(partners)) for (const h of p.hosts) hosts.add(h);
	for (const p of Object.values(FALLBACK_PARTNERS)) for (const h of p.hosts) hosts.add(h);
	return hosts;
}

function fallbackRegistry(): PartnerRegistry {
	return {
		partners: FALLBACK_PARTNERS,
		allowedHosts: collectHosts(FALLBACK_PARTNERS),
		source: "fallback",
		fetchedAt: new Date().toISOString(),
	};
}

async function fetchRows(env: Env): Promise<PartnerRow[] | null> {
	const cacheKey = new Request(CACHE_KEY);
	const cache = caches.default;
	try {
		const cached = await cache.match(cacheKey);
		if (cached) return (await cached.json()) as PartnerRow[];
	} catch {
		// Cache API unavailable (tests / local) — fall through to PostgREST.
	}

	const cols = "go_key,partner_name,vertical,sub_field,domains";
	const res = await fetch(
		`${env.SUPABASE_URL}/rest/v1/affiliate_partners?enabled=eq.true&go_key=not.is.null&select=${cols}`,
		{
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			},
		},
	);
	if (!res.ok) return null;
	const rows = (await res.json()) as PartnerRow[];
	if (!Array.isArray(rows) || rows.length === 0) return null;
	try {
		await cache.put(
			cacheKey,
			new Response(JSON.stringify(rows), {
				headers: { "Cache-Control": `max-age=${EDGE_CACHE_TTL_S}`, "Content-Type": "application/json" },
			}),
		);
	} catch {
		// best-effort
	}
	return rows;
}

export async function loadPartners(env: Env): Promise<PartnerRegistry> {
	if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.registry;
	let registry: PartnerRegistry;
	try {
		const rows = await fetchRows(env);
		registry = rows ? buildRegistry(rows) : fallbackRegistry();
	} catch {
		registry = fallbackRegistry();
	}
	memo = { registry, at: Date.now() };
	return registry;
}

/** Test hook — clears the module memo so each test sees a fresh load. */
export function resetPartnerMemo(): void {
	memo = null;
}
