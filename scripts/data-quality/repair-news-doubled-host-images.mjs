#!/usr/bin/env node
/**
 * Repair news_articles.image_url values whose host is doubled into the path:
 *   https://www.thepinknews.com/www.thepinknews.com/wp-content/a.jpg
 *   -> https://www.thepinknews.com/wp-content/a.jpg
 *
 * Producer: absolutize() in supabase/functions/_shared/news-quality/extract.ts
 * resolved a scheme-less `www.host/path` as a relative path. Fixed on this
 * branch; this script repairs the rows it already wrote.
 * Measured 2026-11-27 (read-only): 419 rows, 2026-04-14 to 2026-11-26.
 *
 * DRY-RUN BY DEFAULT: prints id, slug, before, after. --apply PATCHes.
 * Idempotent: a repaired URL no longer has the doubled host, so a re-run
 * finds nothing. Only the exact `/<same host>/` prefix is removed.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/data-quality/repair-news-doubled-host-images.mjs [--apply]
 */
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}
const APPLY = process.argv.includes('--apply');
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

export function repair(url) {
  const m = /^(https?:\/\/)([^/]+)\/\2(\/.*)$/i.exec(url ?? '');
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

const rows = [];
for (let from = 0; ; from += 1000) {
  // PostgREST cannot express the backreference, so narrow by a cheap filter
  // and confirm each row with repair().
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news_articles?select=id,slug,image_url&image_url=like.*//www.*/www.*&order=id`,
    { headers: { ...headers, Range: `${from}-${from + 999}` } },
  );
  if (!res.ok) throw new Error(`read → HTTP ${res.status}: ${await res.text()}`);
  const page = await res.json();
  rows.push(...page);
  if (page.length < 1000) break;
}
let n = 0;
for (const row of rows) {
  const after = repair(row.image_url);
  if (!after) continue;
  n += 1;
  console.log(`${APPLY ? 'FIX' : 'WOULD FIX'} ${row.id} ${row.slug} ${row.image_url} -> ${after}`);
  if (!APPLY) continue;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/news_articles?id=eq.${row.id}&image_url=eq.${encodeURIComponent(row.image_url)}`,
    { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ image_url: after }) },
  );
  if (!res.ok) throw new Error(`${row.id} → HTTP ${res.status}: ${await res.text()}`);
}
console.error(`${APPLY ? 'Repaired' : 'Dry run: would repair'} ${n} of ${rows.length} candidate rows.`);
