#!/usr/bin/env node
/**
 * Lists rows across indexable entity tables whose name/slug looks like an
 * admin-auto-generated placeholder ("untitled", "untitled-1", "untitled-42",
 * empty string, NULL). These rows are excluded from sitemaps + middleware
 * emits noindex for them (P1.4) — this script surfaces them so editorial can
 * decide whether to rename, merge, or delete.
 *
 * Run after each admin import cycle. The eventual hard CHECK constraint that
 * blocks writes lands once this report returns 0 rows everywhere
 * (SEO-FIXES-PROGRESS.md → "deferred constraints").
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/findPlaceholderRows.mjs
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/findPlaceholderRows.mjs --csv > placeholders.csv
 */

const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!BASE || !KEY) {
  console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  process.exit(2);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' };
const csvMode = process.argv.includes('--csv');

const TABLES = [
  { table: 'venues',         nameField: 'name'  },
  { table: 'cities',         nameField: 'name'  },
  { table: 'countries',      nameField: 'name'  },
  { table: 'events',         nameField: 'title' },
  { table: 'personalities',  nameField: 'name'  },
  { table: 'hotels',         nameField: 'name'  },
  { table: 'queer_villages', nameField: 'name'  },
  { table: 'unified_tags',   nameField: 'name'  },
];

const PLACEHOLDER_PATTERN = '^untitled(-[0-9]+)?$';

async function fetchPlaceholders({ table, nameField }) {
  // PostgREST `or=` with case-insensitive regex via imatch (`~*`), plus the
  // null/empty cases.
  const filters = [
    `${nameField}=imatch.${PLACEHOLDER_PATTERN}`,
    `slug=imatch.${PLACEHOLDER_PATTERN}`,
    `${nameField}=is.null`,
    `${nameField}=eq.`,
  ];
  const orExpr = encodeURIComponent(filters.join(','));
  const select = `id,${nameField},slug,seo_indexable,updated_at`;
  const url = `${BASE}/rest/v1/${table}?or=(${orExpr})&select=${select}&limit=5000`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`! ${table}: HTTP ${res.status} — ${await res.text().catch(() => '')}`);
    return [];
  }
  return res.json();
}

const all = [];
for (const cfg of TABLES) {
  const rows = await fetchPlaceholders(cfg);
  for (const r of rows) {
    all.push({
      table: cfg.table,
      id: r.id,
      name: r[cfg.nameField],
      slug: r.slug,
      seo_indexable: r.seo_indexable,
      updated_at: r.updated_at,
    });
  }
}

if (csvMode) {
  console.log('table,id,name,slug,seo_indexable,updated_at');
  for (const r of all) {
    const cells = [r.table, r.id, r.name ?? '', r.slug ?? '', r.seo_indexable, r.updated_at]
      .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
      .join(',');
    console.log(cells);
  }
} else {
  const byTable = new Map();
  for (const r of all) {
    if (!byTable.has(r.table)) byTable.set(r.table, []);
    byTable.get(r.table).push(r);
  }
  if (!all.length) {
    console.log('✓ No placeholder rows found across any indexable entity table.');
    console.log('  The deferred CHECK constraint can now be applied — see SEO-FIXES-PROGRESS.md.');
    process.exit(0);
  }
  console.log(`Found ${all.length} placeholder rows across ${byTable.size} tables.\n`);
  for (const [table, rows] of byTable) {
    const stillIndexable = rows.filter((r) => r.seo_indexable === true).length;
    console.log(`  ${table}: ${rows.length} row(s) — ${stillIndexable} still flagged seo_indexable=true`);
    for (const r of rows.slice(0, 10)) {
      console.log(`    - ${r.id}  name=${JSON.stringify(r.name)}  slug=${JSON.stringify(r.slug)}`);
    }
    if (rows.length > 10) console.log(`    … +${rows.length - 10} more`);
  }
  console.log('\nRe-run with --csv for the full machine-readable report.');
}
