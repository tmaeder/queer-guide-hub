/**
 * Which airport a city page may claim, and how.
 *
 * `cities.airport_codes` is the UNION of airports that are IN the city and
 * airports merely NEAR it, so the old gate — "airport_codes is non-empty" —
 * made the fact strip assert ownership of whatever was closest: Brighton
 * published "AIRPORT LGW" for a Gatwick 36 km away, Essen published
 * Düsseldorf's, and 3,669 of the 4,669 cities carrying a code were naming an
 * airport that is not theirs (measured on prod 2026-08-26).
 *
 * Migration `20260929100300_city_local_vs_nearest_airport` added
 * `local_airport_codes` / `nearest_airport_codes` / `nearest_airport_km` to
 * draw that line in the data — its header says in as many words that the
 * frontend already knows how to say this properly and that what was missing
 * "is not data, it is the DISTINCTION". This module is that missing half.
 *
 * Two columns are deliberately NOT interchangeable here:
 *
 *   local_airport_codes    the city's own airport — may be claimed outright
 *   nearest_airport_codes  serves the city — must be marked as nearby ("~")
 *
 * `major_airport_code` stays out of this entirely. It is the flight-booking
 * input (`CityTravelHub`, `useTripBookingContext`), and the migration measured
 * and rejected re-pointing it at the local airport: doing so books Dallas
 * through Love Field instead of DFW, and Taipei through Songshan instead of
 * Taoyuan. Display and booking are different questions about one city.
 *
 * The generated Supabase types have not been regenerated since that migration,
 * so the three columns are read through a narrow local shape rather than off
 * the `City` Row. `useOptimizedCity` selects `*`, so they are present at
 * runtime.
 */

/** The three columns added by 20260929100300, as PostgREST returns them. */
interface CityAirportColumns {
  local_airport_codes?: string[] | null;
  nearest_airport_codes?: string[] | null;
  /** `numeric(6,1)` — PostgREST serializes it as a string ("36.4"). */
  nearest_airport_km?: number | string | null;
}

export interface CityAirportColumnsView {
  /** First airport whose own municipality names this city, if any. */
  localIata: string | null;
  /** First vetted airport that merely serves this city, if any. */
  dbNearestIata: string | null;
  /** Distance to `dbNearestIata`, rounded to whole km. */
  dbNearestKm: number | null;
}

/**
 * `array_remove(codes, NULL)` happens in SQL, but a legacy row can still hold
 * the `[null]` junk shape the migration was written to clear, so the first
 * USABLE code is taken rather than `[0]`.
 */
function firstCode(codes: string[] | null | undefined): string | null {
  if (!Array.isArray(codes)) return null;
  return codes.find((code) => typeof code === 'string' && code.length > 0) ?? null;
}

export function readCityAirports(city: unknown): CityAirportColumnsView {
  const row = (city ?? {}) as CityAirportColumns;
  const km = row.nearest_airport_km;
  const parsed = km == null || km === '' ? null : Number(km);

  return {
    localIata: firstCode(row.local_airport_codes),
    dbNearestIata: firstCode(row.nearest_airport_codes),
    dbNearestKm: parsed != null && Number.isFinite(parsed) ? Math.round(parsed) : null,
  };
}

/**
 * One cell naming a city's airport, for a table that has room for a code and
 * nothing else (`/cities/compare`).
 *
 * Same rule as the city single: name the city's OWN airport, and mark a merely
 * nearby one with "~". `majorAirportCode` is the flight-BOOKING code and is
 * frequently an airport in a different city — Brighton's is Gatwick, 36 km away
 * — so printing it flat under a header reading "Airport" asserts Brighton has
 * one.
 *
 * Lives here rather than in `Compare.tsx` so it is importable by a test without
 * exporting a non-component from a page module.
 */
export function cityAirportCell(
  city: unknown,
  majorAirportCode: string | null | undefined,
  emptyValue = '—',
): string {
  const { localIata } = readCityAirports(city);
  if (localIata) return localIata;
  return majorAirportCode ? `~${majorAirportCode}` : emptyValue;
}

/** The nearest-airport shape `useNearestAirport` returns, narrowed to what is read. */
export interface NearestAirportLike {
  iata_code?: string | null;
  distanceKm?: number | null;
}

export interface CityAirportView {
  /** True only when an airport is IN this city. Gates the "~" prefix. */
  hasAirport: boolean;
  /** What the fact strip shows: the city's own airport, else the nearby one. */
  displayIata: string | null;
  /** What the booking widget searches. Never re-pointed at the local airport. */
  bookingIata: string | null;
  /** Populated only when the city has no airport of its own. */
  nearestAirport: { iata_code: string; distanceKm: number | null } | null;
}

/**
 * `hookNearest` is the client-side fallback from `useNearestAirport`. It reads
 * the UNGATED `public.airports` table — 9,252 rows whose `is_major` is false on
 * every one and which still contains bush strips like "Onion Bay" — so a DB
 * answer, which is gated on real scheduled passenger service via
 * `airport_service`, always wins. The hook only speaks for cities the linker
 * resolved nothing for.
 */
export function resolveCityAirports(
  city: unknown,
  hookNearest: NearestAirportLike | null | undefined,
  majorAirportCode: string | null | undefined,
): CityAirportView {
  const { localIata, dbNearestIata, dbNearestKm } = readCityAirports(city);
  const hasAirport = localIata != null;

  const nearbyIata = dbNearestIata ?? hookNearest?.iata_code ?? null;
  const nearbyKm = dbNearestKm ?? hookNearest?.distanceKm ?? null;

  return {
    hasAirport,
    displayIata: localIata ?? nearbyIata,
    bookingIata: majorAirportCode || nearbyIata || null,
    nearestAirport:
      !hasAirport && nearbyIata ? { iata_code: nearbyIata, distanceKm: nearbyKm } : null,
  };
}
