// One-shot operator backfill: forward-geocode venues that have a real address +
// known country but no coordinates. Photon, country-code-validated, rate-limited.
// Processes a time-bounded batch per invocation; call repeatedly until processed=0.
//   GET /functions/v1/backfill-venue-geocode?secret=<S>&limit=150
// verify_jwt is disabled; access is gated by the shared secret below.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const SECRET = 'qg-geo-backfill-7f3a91';
const UA = 'QueerGuide/1.0 (https://queer.guide; venue geocode backfill)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '150', 10), 300);
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: rows, error } = await supa.rpc('venues_needing_geocode', { p_limit: limit });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let processed = 0, updated = 0, skipped = 0;
  const start = Date.now();

  for (const r of rows ?? []) {
    if (Date.now() - start > 110_000) break;
    processed++;
    const cc = (r.ccode as string)?.toUpperCase();
    const q = encodeURIComponent([r.address, r.city, r.cname].filter(Boolean).join(', '));
    try {
      const res = await fetch(`https://photon.komoot.io/api?q=${q}&limit=1&lang=en`, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const j = await res.json();
        const f = j.features?.[0];
        const c = f?.geometry?.coordinates;
        const rc = f?.properties?.countrycode?.toUpperCase();
        if (c && rc && rc === cc && !(c[0] === 0 && c[1] === 0)
            && Math.abs(c[1]) <= 90 && Math.abs(c[0]) <= 180) {
          await supa.from('venues').update({ latitude: c[1], longitude: c[0], geocode_attempted: true }).eq('id', r.id);
          updated++;
        } else { await supa.from('venues').update({ geocode_attempted: true }).eq('id', r.id); skipped++; }
      } else { await supa.from('venues').update({ geocode_attempted: true }).eq('id', r.id); skipped++; }
    } catch { await supa.from('venues').update({ geocode_attempted: true }).eq('id', r.id); skipped++; }
    await sleep(1000);
  }

  return Response.json({ fetched: rows?.length ?? 0, processed, updated, skipped, ms: Date.now() - start });
});
