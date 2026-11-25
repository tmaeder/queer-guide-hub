/**
 * Train and coach connections between two cities from Transitous
 * (https://transitous.org) — free, open-data (GTFS) routing run by volunteers.
 * No prices and no booking: those stay with Trainline / FlixBus / Omio.
 *
 * Fair use: one geocode per city (cached) and one plan per (route, day, mode),
 * cached for 30 minutes per isolate, with an identifying User-Agent.
 */

const API = "https://api.transitous.org/api/v1";
const USER_AGENT = "queer.guide trip finder (https://queer.guide)";
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 300;

export type GroundMode = "rail" | "coach";

export interface GroundConnection {
  /** ISO instant (UTC) of the first train/coach departure. */
  departure: string;
  /** ISO instant (UTC) of the last train/coach arrival. */
  arrival: string;
  /** IANA zones of the first and last stop, to print local station times. */
  departureTz: string;
  arrivalTz: string;
  fromStop: string;
  toStop: string;
  durationMinutes: number;
  transfers: number;
  /** Line names in travel order, e.g. ["ICE 108", "ICE 598"]. */
  lines: string[];
}

interface Place {
  name?: string;
  tz?: string;
  departure?: string;
  arrival?: string;
}
interface Leg {
  mode?: string;
  from?: Place;
  to?: Place;
  displayName?: string;
  routeShortName?: string;
}
interface Itinerary {
  transfers?: number;
  legs?: Leg[];
}
interface GeocodeHit {
  type?: string;
  name?: string;
  lat?: number;
  lon?: number;
  importance?: number | null;
}

// ponytail: per-isolate memory cache; a shared KV/table cache if Transitous
// traffic ever needs to drop further.
const cache = new Map<string, { at: number; value: unknown }>();

function remember<T>(key: string, value: T): T {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

function recall<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

/** Journeys station to station: walking legs before and after are dropped. */
export function mapItineraries(itineraries: Itinerary[]): GroundConnection[] {
  const out: GroundConnection[] = [];
  for (const it of itineraries) {
    const ride = (it.legs ?? []).filter((leg) => leg.mode && leg.mode !== "WALK");
    const first = ride[0];
    const last = ride[ride.length - 1];
    const departure = first?.from?.departure;
    const arrival = last?.to?.arrival;
    if (!first || !last || !departure || !arrival) continue;
    out.push({
      departure,
      arrival,
      departureTz: first.from?.tz ?? "UTC",
      arrivalTz: last.to?.tz ?? "UTC",
      fromStop: first.from?.name ?? "",
      toStop: last.to?.name ?? "",
      durationMinutes: Math.round(
        (Date.parse(arrival) - Date.parse(departure)) / 60000,
      ),
      transfers: Math.max(0, ride.length - 1),
      // A change onto another vehicle of the same line reads as one line.
      lines: ride
        .map((leg) => leg.displayName || leg.routeShortName || leg.mode || "")
        .filter((name, i, all) => name !== all[i - 1]),
    });
  }
  return out;
}

/** The busiest stop for a city name (its main station), else the place itself. */
export function pickStop(hits: GeocodeHit[]): { lat: number; lon: number } | null {
  const usable = hits.filter((h) => typeof h.lat === "number" && typeof h.lon === "number");
  const stops = usable
    .filter((h) => h.type === "STOP")
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  const best = stops[0] ?? usable[0];
  return best ? { lat: best.lat!, lon: best.lon! } : null;
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Transitous ${res.status}`);
  return res.json();
}

async function locate(city: string, fetchImpl: typeof fetch) {
  const key = `geo:${city.toLowerCase()}`;
  const cached = recall<{ lat: number; lon: number } | null>(key);
  if (cached !== undefined) return cached;
  const hits = await getJson(
    `${API}/geocode?text=${encodeURIComponent(city)}`,
    fetchImpl,
  );
  return remember(key, Array.isArray(hits) ? pickStop(hits as GeocodeHit[]) : null);
}

export async function findConnections(
  { from, to, date, mode }: { from: string; to: string; date: string; mode: GroundMode },
  fetchImpl: typeof fetch = fetch,
): Promise<GroundConnection[]> {
  const key = `plan:${mode}:${date}:${from.toLowerCase()}>${to.toLowerCase()}`;
  const cached = recall<GroundConnection[]>(key);
  if (cached) return cached;

  const [a, b] = await Promise.all([locate(from, fetchImpl), locate(to, fetchImpl)]);
  if (!a || !b) return remember(key, []);

  const params = new URLSearchParams({
    fromPlace: `${a.lat},${a.lon}`,
    toPlace: `${b.lat},${b.lon}`,
    // Early morning UTC so the first useful departures of that day come back.
    time: `${date}T05:00:00Z`,
    numItineraries: "4",
    transitModes: mode === "rail" ? "RAIL" : "COACH",
  });
  const plan = (await getJson(`${API}/plan?${params}`, fetchImpl)) as {
    itineraries?: Itinerary[];
  };
  return remember(key, mapItineraries(plan.itineraries ?? []).slice(0, 3));
}
