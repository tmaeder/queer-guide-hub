import { useState, useEffect } from 'react';

export interface VisitorLocation {
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  region?: string;
}

/** Give up on a silent CF edge rather than stall every dependent UI. */
const GEO_TIMEOUT_MS = 2500;

/**
 * Module-level cache. `/api/geo` answers `private, no-store` on purpose
 * (functions/api/geo.ts), so this must NOT go through a persisted react-query
 * cache — but the value is stable for the life of a tab, and six call sites
 * each firing their own request made `/api/geo` one billed Pages-Function
 * invocation per mount on the site's highest-traffic route.
 *
 * `inflight` collapses concurrent mounts onto one request; `resolved` serves
 * every later mount synchronously.
 */
let inflight: Promise<VisitorLocation | null> | null = null;
let resolved: { value: VisitorLocation | null } | null = null;

async function requestGeo(): Promise<VisitorLocation | null> {
  try {
    // Same-origin CF Pages Function — no external vendor sees the visitor.
    // Without a timeout a hanging edge leaves every consumer `loading: true`
    // forever, which reads as a permanently blank section rather than a
    // degraded one.
    const res = await fetch('/api/geo', { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`geo ${res.status}`);
    const data = await res.json();
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null;
    return {
      latitude: data.latitude,
      longitude: data.longitude,
      city: data.city ?? undefined,
      country: data.country ?? undefined,
      region: data.region ?? undefined,
    };
  } catch {
    // Geo unavailable (offline, timeout, dev where `request.cf` is undefined)
    // — silent fallback. Consumers treat null as "no region", never as an error.
    return null;
  }
}

/** Shared fetch; resolves to null rather than rejecting. Exported for tests. */
export function fetchVisitorLocation(): Promise<VisitorLocation | null> {
  if (resolved) return Promise.resolve(resolved.value);
  if (!inflight) {
    inflight = requestGeo().then((value) => {
      resolved = { value };
      inflight = null;
      return value;
    });
  }
  return inflight;
}

/** Test seam — clears the module cache between cases. */
export function __resetVisitorLocationCache() {
  inflight = null;
  resolved = null;
}

/**
 * Returns the visitor's approximate location from Cloudflare geo headers
 * via our own /api/geo CF Pages Function. Data never leaves the trust boundary.
 *
 * Falls back gracefully — returns null if geo data is unavailable.
 * Sensitive geo coordinates are kept in memory only (not persisted in web
 * storage), which is why this uses a module cache rather than react-query's.
 */
export function useVisitorLocation() {
  // Already-resolved mounts start settled, so a late-mounting consumer never
  // flashes a skeleton for data this tab already has.
  const [location, setLocation] = useState<VisitorLocation | null>(
    () => resolved?.value ?? null,
  );
  const [loading, setLoading] = useState(() => resolved === null);

  useEffect(() => {
    if (resolved) return;
    let cancelled = false;
    fetchVisitorLocation().then((value) => {
      if (cancelled) return;
      setLocation(value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { location, loading };
}
