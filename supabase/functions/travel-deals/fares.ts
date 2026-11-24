/**
 * Aviasales affiliate URL builder — params query format.
 *
 * Format: https://www.aviasales.com/?params={ORIGIN}{DDMM}{DEST}{DDMM_RET}{ADULTS}&marker=MARKER
 *
 * ⚠️  Do NOT use path-based format (`/ZRH0905BCN1`) — Aviasales returns 404 for path segments.
 * ⚠️  Do NOT use `search.aviasales.com/flights/?origin_iata=...` — redirects to aviasales.ru
 */
const MARKER = "452012";
const IATA_RE = /^[A-Z]{3}$/;

function extractDDMM(dateStr?: string | null): string {
  if (!dateStr) return "";
  const iso = dateStr.split("T")[0]; // "YYYY-MM-DD"
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  const [, mm, dd] = parts;
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  if (
    isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31
  ) return "";
  return `${dd.padStart(2, "0")}${mm.padStart(2, "0")}`;
}

export function buildAffiliateUrl(
  origin: string,
  destination: string,
  departDate?: string | null,
  returnDate?: string | null,
): string {
  const o = (origin || "").toUpperCase().trim();
  const d = (destination || "").toUpperCase().trim();

  // Validate IATA codes — fallback to generic search on invalid input
  if (!IATA_RE.test(o) || !IATA_RE.test(d) || o === d) {
    return `https://www.aviasales.com/?marker=${MARKER}`;
  }

  let params = o;
  const departDDMM = extractDDMM(departDate);
  if (departDDMM) params += departDDMM;
  params += d;
  const returnDDMM = extractDDMM(returnDate);
  if (returnDDMM) params += returnDDMM;
  params += "1"; // 1 adult

  return `https://www.aviasales.com/?params=${params}&marker=${MARKER}`;
}

export interface FareSearch {
  origin: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  type: "flights" | "popular_routes";
  currency: string;
  limit: number;
}

export function isFlightDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

interface ProviderFare {
  origin?: string;
  destination: string;
  price: number;
  departure_at?: string;
  return_at?: string;
  airline?: string;
  flight_number?: string;
  transfers?: number;
  duration?: number;
}

/** Exact-date queries never fall back to an unfiltered endpoint. */
export async function fetchFares(
  search: FareSearch,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  const popular = search.type === "popular_routes";
  const url = new URL(
    "https://api.travelpayouts.com/aviasales/v3/prices_for_dates",
  );
  url.searchParams.set("origin", search.origin);
  if (search.destination && !popular) {
    url.searchParams.set("destination", search.destination);
  }
  if (search.departureDate && !popular) {
    url.searchParams.set("departure_at", search.departureDate);
  }
  if (search.returnDate && !popular) {
    url.searchParams.set("return_at", search.returnDate);
  }
  url.searchParams.set("one_way", String(popular || !search.returnDate));
  url.searchParams.set("currency", search.currency);
  url.searchParams.set("sorting", "price");
  url.searchParams.set("unique", String(popular));
  url.searchParams.set("limit", String(search.limit));
  const response = await fetcher(url, {
    headers: { "X-Access-Token": token },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Fare provider unavailable (${response.status})`);
  }
  const data = await response.json();
  if (data.success === false || !Array.isArray(data.data)) {
    throw new Error("Invalid fare provider response");
  }
  const seen = new Set<string>();
  return (data.data as ProviderFare[])
    .filter((fare) =>
      IATA_RE.test(fare.destination) && Number.isFinite(fare.price) &&
      fare.price > 0
    )
    .filter((fare) =>
      popular ||
      ((!search.departureDate ||
        fare.departure_at?.slice(0, 10) === search.departureDate) &&
        (!search.returnDate ||
          fare.return_at?.slice(0, 10) === search.returnDate))
    )
    .sort((a, b) => a.price - b.price)
    .filter((fare) => {
      if (!popular) return true;
      if (seen.has(fare.destination)) return false;
      seen.add(fare.destination);
      return true;
    })
    .slice(0, search.limit)
    .map((fare) => ({
      origin: fare.origin || search.origin,
      destination: fare.destination,
      price: fare.price,
      currency: data.currency || search.currency,
      departure_date: fare.departure_at || null,
      return_date: fare.return_at || null,
      airline: fare.airline || null,
      flight_number: fare.flight_number,
      stops: fare.transfers || 0,
      duration: fare.duration,
      affiliate_url: buildAffiliateUrl(
        fare.origin || search.origin,
        fare.destination,
        fare.departure_at,
        fare.return_at,
      ),
    }));
}
