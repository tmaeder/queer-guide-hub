// shared-mobility-refresh — national snapshot of rideable shared bikes & e-scooters.
//
// Source: sharedmobility.ch GBFS 2.0 (Swiss Federal Office of Energy), open data,
// attribution required, no key. Writes the single shared_mobility_snapshot row
// (migration 99991792696992); the browser reads only that row.
//
// A failed WRITE or a truncated feed still exits 5xx: a 200 resets
// consecutive_failures (see airport-service-refresh for the incident), and a
// suspiciously small feed must never replace a good snapshot with an empty map.
//
// AN UPSTREAM THAT IS MERELY SLOW IS NOT OUR FAILURE, and reporting it as one took
// this job offline for three days (2026-11-08 → 11-11). free_bike_status.json is
// 7.2 MB and measured 8.97 / 10.83 / 10.89 / 13.94 / 14.34 / 21.89 s on 2026-11-11,
// against a 12 s per-attempt timeout — the timeout sat in the MIDDLE of the latency
// distribution, so roughly half of all runs aborted (07:05✓ 07:10✓ 07:15✗ 07:20✓
// 07:25✗ 07:30✗ 07:35✓ 07:40✗ 07:45✗ 07:50✗), three landed consecutively,
// auto_pause_threshold=3 fired and the nightly reconciler unscheduled the row.
// Two attempts could never have saved it: 2 x 12 s on a resource needing ~12.4 s
// median fails both times and already overruns the request budget.
//
// So the timeout now covers the measured range, and a transient fetch failure
// reports SKIPPED (200) while the existing snapshot is still young — the shape
// venue-accessibility-osm already uses for a busy Overpass mirror. Escalation is
// what keeps that honest: once the snapshot passes STALE_ESCALATE_MIN the outage is
// no longer weather and the function goes 5xx again, so auto-pause can still fire.
// The reader is protected independently either way — the UI hides counts past
// 20 min and check-pipeline-health hard-fails on a snapshot older than 120 min —
// so a SKIPPED run can never publish stale numbers as fresh.

import { getCorsHeaders, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts';
import { safeErrCode } from '../_shared/safe-error.ts';
import { aggregateToGrid, type GbfsBike } from './grid.ts';
import { isTransientOutage } from './staleness.ts';

const BASE = 'https://sharedmobility.ch';
const UA = 'QueerGuideBot/1.0 (https://queer.guide)';
const MIN_VEHICLES = 2000; // measured 23,370 nationally on 2026-10-22

// 25 s covers the whole measured range (max 21.89 s) with room for TLS and a cold
// start, and fits the registered 50 s pg_net budget alongside aggregation + write.
const FEED_TIMEOUT_MS = 25_000;
// providers.json is 17 KB and answers in 0.33-0.53 s, so it can afford a retry.
const PROVIDERS_TIMEOUT_MS = 5_000;
async function getJson<T>(path: string, timeoutMs: number, attempts: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= attempts - 1;
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250));
    let res: Response;
    try {
      res = await fetch(`${BASE}/${path}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
    } catch (error) {
      if (last) throw error;
      continue;
    }
    await res.body?.cancel();
    if (last || res.status < 500) throw new Error(`${path}: HTTP ${res.status}`);
  }
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
      getJson<{ last_updated: number; data: { bikes: GbfsBike[] } }>('free_bike_status.json', FEED_TIMEOUT_MS, 1),
      getJson<{ data: { providers: { provider_id: string; vehicle_type?: string }[] } }>(
        'providers.json',
        PROVIDERS_TIMEOUT_MS,
        2,
      ),
    ]);
  } catch (e) {
    const detail = safeErrCode(e, [], 'shared-mobility-refresh/fetch');
    // Read the snapshot we already hold: its age decides whether this is weather or
    // an outage. A failed read is treated as stale, so losing sight of the snapshot
    // escalates rather than silently granting the upstream an indefinite pass.
    const { data: snap } = await supabase
      .from('shared_mobility_snapshot')
      .select('generated_at')
      .eq('region', 'ch')
      .maybeSingle();
    const ageMin = snap?.generated_at ? (Date.now() - Date.parse(snap.generated_at)) / 60_000 : Infinity;
    if (isTransientOutage(ageMin)) {
      return jsonResponse(
        { ok: true, skipped: 'upstream_unavailable', detail, snapshot_age_min: Math.round(ageMin) },
        200,
        req,
      );
    }
    return jsonResponse(
      { error: 'gbfs_unavailable', detail, snapshot_age_min: Number.isFinite(ageMin) ? Math.round(ageMin) : null },
      503,
      req,
    );
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
