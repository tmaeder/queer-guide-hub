// shared-mobility-refresh — national snapshot of rideable shared bikes & e-scooters.
//
// Source: sharedmobility.ch GBFS 2.0 (Swiss Federal Office of Energy), open data,
// attribution required, no key. Writes the single shared_mobility_snapshot row
// (migration 99991792693301); the browser reads only that row.
//
// Every failure exits 5xx: this is a tracked automation and a 200 resets
// consecutive_failures (see airport-service-refresh for the incident).
// A suspiciously small feed is refused rather than written, so a truncated
// fetch never replaces a good snapshot with an empty map.

import { getCorsHeaders, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts';
import { safeErrCode } from '../_shared/safe-error.ts';
import { aggregateToGrid, type GbfsBike } from './grid.ts';

const BASE = 'https://sharedmobility.ch';
const UA = 'QueerGuideBot/1.0 (https://queer.guide)';
const MIN_VEHICLES = 2000; // measured 23,370 nationally on 2026-10-22

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  const supabase = getServiceClient();
  const auth = await requireInternalOrAdmin(req, supabase);
  if (auth instanceof Response) return auth;
  const { dry_run: dryRun = false } = (await req.json().catch(() => ({}))) as { dry_run?: boolean };

  let feed, providers;
  try {
    [feed, providers] = await Promise.all([
      getJson<{ last_updated: number; data: { bikes: GbfsBike[] } }>('free_bike_status.json'),
      getJson<{ data: { providers: { provider_id: string; vehicle_type?: string }[] } }>('providers.json'),
    ]);
  } catch (e) {
    return jsonResponse({ error: 'gbfs_unavailable', detail: safeErrCode(e, [], 'shared-mobility-refresh/fetch') }, 503, req);
  }

  const types = Object.fromEntries(providers.data.providers.map((p) => [p.provider_id, p.vehicle_type]));
  const grid = aggregateToGrid(feed.data?.bikes ?? [], types);
  if (grid.vehicles < MIN_VEHICLES) {
    return jsonResponse({ error: 'feed_too_small', vehicles: grid.vehicles }, 502, req);
  }

  const row = {
    region: 'ch',
    cells: grid.cells,
    vehicles: grid.vehicles,
    providers: grid.providers,
    source_url: `${BASE}/gbfs.json`,
    attribution: 'Shared mobility: sharedmobility.ch (SFOE)',
    source_updated_at: new Date(feed.last_updated * 1000).toISOString(),
    generated_at: new Date().toISOString(),
  };
  if (!dryRun) {
    const { error } = await supabase.from('shared_mobility_snapshot').upsert(row);
    if (error) return jsonResponse({ error: 'write_failed', detail: safeErrCode(error, [], 'shared-mobility-refresh/write') }, 500, req);
  }
  return jsonResponse({ ok: true, dry_run: dryRun, vehicles: grid.vehicles, cells: grid.cells.length, providers: grid.providers.length }, 200, req);
});
