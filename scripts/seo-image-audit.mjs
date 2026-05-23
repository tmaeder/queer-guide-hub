#!/usr/bin/env node
/**
 * Reports rows whose chosen og:image URL would be replaced with the branded
 * default by functions/_lib/safeOgImage.ts (P2.5). Editorial decides whether
 * to self-host an alternative.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seo-image-audit.mjs
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seo-image-audit.mjs --csv > image-audit.csv
 *
 * Returns exit 0 always — this is a report, not a gate.
 */

const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!BASE || !KEY) {
  console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  process.exit(2);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' };
const csvMode = process.argv.includes('--csv');

const BLOCKED_HOSTS = new Set([
  'wikipedia.org',
  'en.wikipedia.org',
  'upload.wikimedia.org',
  'commons.wikimedia.org',
]);

function isHotlinked(url) {
  if (typeof url !== 'string' || !url) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== 'https:') return true;
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith('.wikimedia.org')) return true;
  if (host.endsWith('.wikipedia.org')) return true;
  return false;
}

async function fetchImageUrls(table, idField, nameField, imageField) {
  // Pull rows with a non-null image; filter client-side for hotlinks.
  const url = `${BASE}/rest/v1/${table}?seo_indexable=eq.true&${imageField}=not.is.null&select=${idField},${nameField},${imageField}&limit=10000`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`! ${table}: HTTP ${res.status}`);
    return [];
  }
  const rows = await res.json();
  return rows
    .map((r) => {
      const raw = r[imageField];
      const candidate = Array.isArray(raw) ? raw[0] : raw;
      return { table, id: r[idField], name: r[nameField], image: candidate };
    })
    .filter((r) => isHotlinked(r.image));
}

const TARGETS = [
  { table: 'venues',         id: 'id', name: 'name', field: 'images' },
  { table: 'events',         id: 'id', name: 'title', field: 'images' },
  { table: 'personalities',  id: 'id', name: 'name', field: 'image_url' },
  { table: 'cities',         id: 'id', name: 'name', field: 'image_url' },
  { table: 'countries',      id: 'id', name: 'name', field: 'image_url' },
  { table: 'hotels',         id: 'id', name: 'name', field: 'images' },
  { table: 'queer_villages', id: 'id', name: 'name', field: 'image_url' },
  { table: 'unified_tags',   id: 'id', name: 'name', field: 'image_url' },
];

const all = [];
for (const t of TARGETS) {
  const rows = await fetchImageUrls(t.table, t.id, t.name, t.field);
  all.push(...rows);
}

if (csvMode) {
  console.log('table,id,name,image');
  for (const r of all) {
    const cells = [r.table, r.id, r.name ?? '', r.image ?? '']
      .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
      .join(',');
    console.log(cells);
  }
} else {
  if (!all.length) {
    console.log('✓ No hotlinked images found across indexable rows.');
    process.exit(0);
  }
  const byTable = new Map();
  for (const r of all) {
    if (!byTable.has(r.table)) byTable.set(r.table, []);
    byTable.get(r.table).push(r);
  }
  console.log(`Found ${all.length} rows with hotlinked og:image candidates.\n`);
  for (const [table, rows] of byTable) {
    console.log(`  ${table}: ${rows.length} row(s)`);
    for (const r of rows.slice(0, 5)) {
      console.log(`    - ${r.id}  ${JSON.stringify(r.name)}  ${r.image}`);
    }
    if (rows.length > 5) console.log(`    … +${rows.length - 5} more`);
  }
  console.log('\nThese rows currently fall back to the branded default og:image.');
  console.log('Editorial: replace with self-hosted assets or leave as-is.');
  console.log('Re-run with --csv for the full machine-readable report.');
}
