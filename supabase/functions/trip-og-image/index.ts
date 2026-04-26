/**
 * trip-og-image — generates an Open Graph card (PNG 1200×630) for a
 * public trip. Called by crawlers on share — no auth required, so
 * deployed with verify_jwt=false. Output is cached for 24h.
 *
 * GET /trip-og-image?trip_id=<uuid>
 * GET /trip-og-image?token=<share_token>
 *
 * Rasterizes an SVG composed from trip data (title, date range,
 * country badges) via @resvg/resvg-wasm. The final PNG is suitable
 * for Facebook, Twitter, LinkedIn, Slack previews.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// resvg-wasm must be initialized once per isolate
let wasmReady: Promise<void> | null = null;
async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = fetch('https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm')
      .then((r) => r.arrayBuffer())
      .then((buf) => initWasm(buf));
  }
  return wasmReady;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
}

function wrapTitle(title: string, maxChars = 34): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
    if (lines.length === 2) break;
  }
  if (current && lines.length < 3) lines.push(current);
  return lines.slice(0, 3);
}

function buildSvg(args: {
  title: string;
  dateRange: string;
  countries: string[];
}): string {
  const titleLines = wrapTitle(args.title);
  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="80" y="${260 + i * 90}" font-family="Inter, Arial, sans-serif" font-size="78" font-weight="800" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join('\n');

  const badges = args.countries.slice(0, 4).map((c, i) => {
    const x = 80 + i * 180;
    return `
      <rect x="${x}" y="520" width="160" height="44" rx="0" fill="rgba(255,255,255,0.14)" />
      <text x="${x + 18}" y="550" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="600" fill="#ffffff">${escapeXml(c.slice(0, 14))}</text>
    `;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#b60d3d"/>
      <stop offset="100%" stop-color="#6b0722"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="80" y="120" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="0.08em" fill="rgba(255,255,255,0.85)">QUEER.GUIDE · SHARED TRIP</text>
  ${titleSvg}
  <text x="80" y="480" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="500" fill="rgba(255,255,255,0.9)">${escapeXml(args.dateRange)}</text>
  ${badges}
</svg>`;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTrip(admin: any, params: URLSearchParams) {
  const tripId = params.get('trip_id');
  const token = params.get('token');
  let id = tripId;
  if (!id && token) {
    const { data: link } = await admin
      .from('trip_share_links')
      .select('trip_id')
      .eq('token', token)
      .maybeSingle();
    id = link?.trip_id ?? null;
  }
  if (!id) return null;
  const { data: trip } = await admin
    .from('trips')
    .select('id, title, start_date, end_date')
    .eq('id', id)
    .maybeSingle();
  if (!trip) return null;

  // Countries via trip_places + countries join
  const { data: places } = await admin
    .from('trip_places')
    .select('country_id')
    .eq('trip_id', id);
  const countryIds = [
    ...new Set(((places ?? []) as { country_id: string | null }[]).map((p) => p.country_id).filter(Boolean) as string[]),
  ];
  let countries: string[] = [];
  if (countryIds.length > 0) {
    const { data: rows } = await admin.from('countries').select('name').in('id', countryIds);
    countries = ((rows ?? []) as { name: string }[]).map((r) => r.name);
  }
  return { trip, countries };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }
  try {
    const url = new URL(req.url);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const loaded = await loadTrip(admin, url.searchParams);
    if (!loaded) {
      return new Response('not found', { status: 404, headers: cors });
    }

    const dateRange =
      loaded.trip.start_date && loaded.trip.end_date
        ? `${fmtDate(loaded.trip.start_date)} — ${fmtDate(loaded.trip.end_date)}`
        : loaded.trip.start_date
          ? fmtDate(loaded.trip.start_date)
          : 'Plans in progress';

    const svg = buildSvg({
      title: loaded.trip.title || 'A trip',
      dateRange,
      countries: loaded.countries,
    });

    await ensureWasm();
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      font: { loadSystemFonts: false },
    });
    const png = resvg.render().asPng();

    return new Response(png, {
      headers: {
        ...cors,
        'content-type': 'image/png',
        'cache-control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (err) {
    return new Response(
      `og error: ${String((err as Error).message ?? err)}`,
      { status: 500, headers: cors },
    );
  }
});
