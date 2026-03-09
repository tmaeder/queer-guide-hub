/**
 * get-refuge-restrooms — Proxy for the Refuge Restrooms public API.
 * Completely stateless, no DB needed.
 */
import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../cors';

const REFUGE_API = 'https://www.refugerestrooms.org/api/v1/restrooms';

export async function handleRefugeRestrooms(req: Request, env: Env): Promise<Response> {
  let lat: string | null = null;
  let lng: string | null = null;
  let page = '1';
  let perPage = '100';

  if (req.method === 'GET') {
    const url = new URL(req.url);
    lat = url.searchParams.get('lat');
    lng = url.searchParams.get('lng');
    page = url.searchParams.get('page') || '1';
    perPage = url.searchParams.get('per_page') || '100';
  } else {
    try {
      const body = await req.json<any>();
      lat = body.lat?.toString() ?? null;
      lng = body.lng?.toString() ?? null;
      page = body.page?.toString() ?? '1';
      perPage = body.per_page?.toString() ?? '100';
    } catch { /* empty body */ }
  }

  const hasLocation = lat && lng;
  const basePath = hasLocation ? `${REFUGE_API}/by_location` : REFUGE_API;
  const params = new URLSearchParams({ page, per_page: perPage });
  if (hasLocation) {
    params.append('lat', lat!);
    params.append('lng', lng!);
  }

  const response = await fetch(`${basePath}?${params.toString()}`, {
    headers: { 'User-Agent': 'Queer Guide App' },
  });

  if (!response.ok) {
    return errorResponse(`Refuge API error: ${response.status}`, response.status, req, env);
  }

  const data = (await response.json()) as any[];

  const restrooms = data.map((r) => ({
    id: r.id,
    name: r.name,
    street: r.street,
    city: r.city,
    state: r.state,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
    accessible: r.accessible,
    unisex: r.unisex,
    changing_table: r.changing_table,
    comment: r.comment,
    directions: r.directions,
    created_at: r.created_at,
    updated_at: r.updated_at,
    upvote: r.upvote,
    downvote: r.downvote,
  }));

  return jsonResponse(restrooms, 200, req, env);
}
