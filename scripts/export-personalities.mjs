#!/usr/bin/env node
// Export every row of public.personalities to an Excel workbook.
//
// Usage:
//   node scripts/export-personalities.mjs [output.xlsx]
//
// Reads VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (or SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY for an unrestricted dump that bypasses RLS) from
// the environment or from .env at the repo root. Paginates in batches of 1000
// to stay below PostgREST's row limit.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import ExcelJS from 'exceljs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL / VITE_SUPABASE_URL and a key.');
  console.error('Set VITE_SUPABASE_ANON_KEY (public rows only) or');
  console.error('SUPABASE_SERVICE_ROLE_KEY (everything, bypasses RLS).');
  process.exit(1);
}

const outPath = resolve(root, process.argv[2] ?? 'personalities.xlsx');

const COLUMNS = [
  { key: 'name', header: 'Name', width: 30 },
  { key: 'slug', header: 'Slug', width: 30 },
  { key: 'pronouns', header: 'Pronouns', width: 12 },
  { key: 'profession', header: 'Profession', width: 24 },
  { key: 'nationality', header: 'Nationality', width: 16 },
  { key: 'birth_date', header: 'Birth date', width: 14 },
  { key: 'death_date', header: 'Death date', width: 14 },
  { key: 'is_living', header: 'Living', width: 8 },
  { key: 'cause_of_death', header: 'Cause of death', width: 16 },
  { key: 'birth_place', header: 'Birth place', width: 24 },
  { key: 'death_place', header: 'Death place', width: 24 },
  { key: 'lgbti_connection', header: 'LGBTI connection', width: 18 },
  { key: 'lgbti_details', header: 'LGBTI details', width: 50 },
  { key: 'lgbti_relevance_score', header: 'LGBTI relevance', width: 14 },
  { key: 'description', header: 'Description', width: 60 },
  { key: 'bio', header: 'Bio', width: 60 },
  { key: 'top_book', header: 'Top book', width: 30 },
  { key: 'website_url', header: 'Website', width: 40 },
  { key: 'profile_url', header: 'Profile URL', width: 40 },
  { key: 'image_url', header: 'Image URL', width: 40 },
  { key: 'wikidata_qid', header: 'Wikidata QID', width: 14 },
  { key: 'tags', header: 'Tags', width: 30 },
  { key: 'fields', header: 'Fields', width: 30 },
  { key: 'achievements', header: 'Achievements', width: 40 },
  { key: 'social_links', header: 'Social links', width: 30 },
  { key: 'verification_status', header: 'Verification', width: 14 },
  { key: 'visibility', header: 'Visibility', width: 12 },
  { key: 'is_featured', header: 'Featured', width: 10 },
  { key: 'quality_score', header: 'Quality', width: 10 },
  { key: 'view_count', header: 'Views', width: 10 },
  { key: 'sanctions_status', header: 'Sanctions', width: 14 },
  { key: 'regulatory_notes', header: 'Regulatory notes', width: 30 },
  { key: 'created_at', header: 'Created at', width: 22 },
  { key: 'updated_at', header: 'Updated at', width: 22 },
  { key: 'id', header: 'ID', width: 36 },
];

const SELECT = COLUMNS.map((c) => c.key).join(',');
const PAGE = 1000;

async function fetchPage(from, to) {
  const endpoint = `${url}/rest/v1/personalities?select=${SELECT}&order=name.asc`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `${from}-${to}`,
      'Range-Unit': 'items',
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }
  const contentRange = res.headers.get('content-range');
  const total = contentRange ? Number(contentRange.split('/')[1]) : null;
  const rows = await res.json();
  return { rows, total };
}

function flatten(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function main() {
  process.stdout.write('Fetching personalities…\n');
  const all = [];
  let total = null;
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { rows, total: t } = await fetchPage(from, to);
    if (total === null) total = t;
    all.push(...rows);
    process.stdout.write(`  ${all.length}${total ? ` / ${total}` : ''}\n`);
    if (rows.length < PAGE) break;
    if (total !== null && all.length >= total) break;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'queer.guide export';
  wb.created = new Date();
  const ws = wb.addWorksheet('Personalities', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = COLUMNS;
  ws.getRow(1).font = { bold: true };

  for (const row of all) {
    const flat = {};
    for (const col of COLUMNS) flat[col.key] = flatten(row[col.key]);
    ws.addRow(flat);
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${all.length} rows → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
