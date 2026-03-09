import type { Env } from '../types';
import { jsonResponse, errorResponse, corsResponse, getAllowedOrigins, getOrigin } from '../cors';

function buildPlaceName(props: Record<string, any>): string {
  const parts: string[] = [];
  if (props.housenumber && props.street) {
    parts.push(`${props.street} ${props.housenumber}`);
  } else if (props.street) {
    parts.push(props.street);
  } else if (props.name) {
    parts.push(props.name);
  }
  if (props.city && !parts.includes(props.city)) parts.push(props.city);
  if (props.state && !parts.includes(props.state)) parts.push(props.state);
  if (props.country && !parts.includes(props.country)) parts.push(props.country);
  return parts.join(', ') || props.name || 'Unknown';
}

function photonToMapbox(feature: any): any {
  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates || [0, 0];

  const context: Array<{ id: string; text: string }> = [];
  if (props.city) context.push({ id: 'place', text: props.city });
  if (props.state) context.push({ id: 'region', text: props.state });
  if (props.country) context.push({ id: 'country', text: props.country });
  if (props.postcode) context.push({ id: 'postcode', text: props.postcode });

  return {
    id: `photon.${props.osm_id || Math.random().toString(36).slice(2)}`,
    place_name: buildPlaceName(props),
    center: coords,
    context,
    properties: props,
    geometry: feature.geometry,
    type: 'Feature',
  };
}

export async function handleGeocoding(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req, env);

  const origin = getOrigin(req);
  if (!getAllowedOrigins(env).has(origin)) {
    return errorResponse('Origin not allowed', 403, req, env);
  }

  try {
    const { query, isReverseGeocode = false, types } = await req.json<{
      query?: string;
      isReverseGeocode?: boolean;
      types?: string[];
    }>();

    if (!query) {
      return errorResponse('Query parameter is required', 400, req, env);
    }

    let photonUrl: string;
    if (isReverseGeocode) {
      const [lng, lat] = query.split(',').map((s) => s.trim());
      photonUrl = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&limit=1`;
    } else {
      photonUrl = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=5&lang=en`;
    }

    const photonResponse = await fetch(photonUrl);
    if (!photonResponse.ok) {
      throw new Error(`Photon API error: ${photonResponse.status}`);
    }

    const photonData = await photonResponse.json<{ features?: any[] }>();
    const transformedFeatures = (photonData.features || []).map(photonToMapbox);

    return jsonResponse(
      { type: 'FeatureCollection', features: transformedFeatures },
      200,
      req,
      env,
    );
  } catch (err) {
    console.error('Geocoding error:', err);
    return errorResponse('Internal server error', 500, req, env);
  }
}
