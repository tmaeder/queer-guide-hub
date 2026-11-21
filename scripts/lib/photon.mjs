// Photon client for operator scripts. Same env vars and modes as
// supabase/functions/_shared/photon-client.ts (see docs/geocoding.md):
//   PHOTON_MODE=komoot|shadow|primary, PHOTON_PRIMARY_URL, PHOTON_FALLBACK_URL,
//   PHOTON_ACCESS_CLIENT_ID / _SECRET (sent to the primary only),
//   PHOTON_INTERVAL_MS (komoot pacing, 1100), PHOTON_SELF_INTERVAL_MS (50).
// Scripts are one process, so shadow mode is treated as komoot here and the
// breaker is local: 3 consecutive primary failures skip it for the rest of the run.
// Never log query text or coordinates.

const env = (k) => process.env[k]?.trim() || undefined;
const trim = (s) => s.replace(/\/+$/, '');
const legacy = env('PHOTON_SEARCH_URL') || env('PHOTON_REVERSE_URL');
const PRIMARY = env('PHOTON_PRIMARY_URL') ? trim(env('PHOTON_PRIMARY_URL')) : null;
const FALLBACK = trim(env('PHOTON_FALLBACK_URL') || (legacy ? trim(legacy).replace(/\/(api|reverse)$/, '') : 'https://photon.komoot.io'));
const MODE = PRIMARY && env('PHOTON_MODE') === 'primary' ? 'primary' : 'komoot';
const KOMOOT_MS = Number(env('PHOTON_INTERVAL_MS') ?? 1100);
const SELF_MS = Number(env('PHOTON_SELF_INTERVAL_MS') ?? 50);
const PRIMARY_TIMEOUT_MS = Number(env('PHOTON_PRIMARY_TIMEOUT_MS') ?? 2500);
const UA = 'QueerGuide/1.0 (https://queer.guide)';

let selfFails = 0;
let last = 'komoot';

async function call(upstream, endpoint, params, timeoutMs) {
  const headers = { 'User-Agent': UA, Accept: 'application/json' };
  if (upstream === 'self' && env('PHOTON_ACCESS_CLIENT_ID') && env('PHOTON_ACCESS_CLIENT_SECRET')) {
    headers['CF-Access-Client-Id'] = env('PHOTON_ACCESS_CLIENT_ID');
    headers['CF-Access-Client-Secret'] = env('PHOTON_ACCESS_CLIENT_SECRET');
  }
  const base = upstream === 'self' ? PRIMARY : FALLBACK;
  try {
    const res = await fetch(`${base}/${endpoint}?${params}`, {
      headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) return { ok: false, status: 403, data: null, upstream };
    if (!res.ok) return { ok: false, status: res.status, data: null, upstream };
    const data = await res.json();
    return Array.isArray(data?.features)
      ? { ok: true, status: res.status, data, upstream }
      : { ok: false, status: 502, data: null, upstream };
  } catch {
    return { ok: false, status: 0, data: null, upstream };
  }
}

const retriable = (r) => r.status === 0 || r.status === 403 || r.status === 429 || r.status >= 500;

async function request(endpoint, params) {
  if (MODE === 'primary' && selfFails < 3) {
    const r = await call('self', endpoint, params, PRIMARY_TIMEOUT_MS);
    if (r.ok || !retriable(r)) {
      selfFails = 0;
      last = 'self';
      return r;
    }
    if (++selfFails === 3) console.warn('[photon] primary failed 3x, using komoot for the rest of this run');
  }
  last = 'komoot';
  return call('komoot', endpoint, params, 15_000);
}

/** Forward geocode → { ok, status, data, upstream } with raw Photon GeoJSON in data. */
export function photonSearch(q, { lang, limit, lat, lon, countryCode } = {}) {
  const p = new URLSearchParams({ q });
  if (lang) p.set('lang', lang);
  if (limit) p.set('limit', String(limit));
  if (Number.isFinite(lat) && Number.isFinite(lon)) { p.set('lat', String(lat)); p.set('lon', String(lon)); }
  if (countryCode) p.set('countrycode', countryCode.toLowerCase());
  return request('api', p);
}

/** Reverse geocode → { ok, status, data, upstream }. */
export function photonReverse(lat, lon, { lang, limit } = {}) {
  const p = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (lang) p.set('lang', lang);
  if (limit) p.set('limit', String(limit));
  return request('reverse', p);
}

/** Pause before the next request, paced for whichever upstream answered last. */
export function photonPause() {
  return new Promise((r) => setTimeout(r, last === 'self' ? SELF_MS : KOMOOT_MS));
}

export const photonMode = MODE;
