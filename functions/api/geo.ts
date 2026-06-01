/**
 * GET /api/geo — the visitor's approximate location from Cloudflare's edge
 * (`request.cf`), served same-origin so coordinates never touch a third-party
 * vendor. Consumed by `useVisitorLocation` (kept in memory only, never
 * persisted) for currency detection, regional events and near-me.
 *
 * The hook was pointed at this endpoint in #1289 but the function was never
 * created, so `/api/geo` 404'd on prod and geo silently degraded for a week.
 * This restores it. `_middleware.ts` skips `/api/`, so no OG/meta rewriting
 * interferes.
 *
 * Coordinates are coarse city-level (Cloudflare's IP geo), not GPS. Marked
 * `private, no-store` so the CDN never serves one visitor's location to
 * another.
 */

interface CfGeo {
  latitude?: string;
  longitude?: string;
  city?: string;
  country?: string;
  region?: string;
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const cf = (request.cf ?? {}) as CfGeo;
  const lat = cf.latitude != null ? Number(cf.latitude) : NaN;
  const lng = cf.longitude != null ? Number(cf.longitude) : NaN;

  const body = {
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    city: cf.city ?? null,
    country: cf.country ?? null,
    region: cf.region ?? null,
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });
};
