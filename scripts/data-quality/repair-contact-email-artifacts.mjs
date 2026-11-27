#!/usr/bin/env node
/**
 * Repair stored contact emails that carry a scrape artifact: a trailing
 * `mailto` (`info@queerbooks.chmailto`) or a leading `mailto:`.
 *
 * Measured 2026-11-27 (read-only): 924 venues + 743 organizations, all 1,667
 * repairable by the rule below, 0 hotels, 0 marketplace listings.
 *
 * DRY-RUN BY DEFAULT. It prints every affected row (table, id, slug, before,
 * after) and writes nothing. Pass --apply to PATCH the rows. Idempotent: a
 * repaired row no longer matches the selector, so a re-run finds nothing.
 * Values the rule cannot repair without guessing are listed and left alone.
 *
 * The rule mirrors contactEmail() in src/lib/entityContact.ts and
 * public.canonicalize_contact_email() in migration 99991795786927, which
 * guards future writes once applied.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/data-quality/repair-contact-email-artifacts.mjs
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/data-quality/repair-contact-email-artifacts.mjs --apply
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}
const APPLY = process.argv.includes('--apply');
const EMAIL_RE = /^[^@\s<>()"',;:]+@[^@\s<>()"',;:]+\.[a-z]{2,}$/i;

export function repair(raw) {
  let v = String(raw).trim().replace(/^mailto:/i, '');
  const stripped = v.replace(/mailto$/i, '');
  if (stripped !== v && EMAIL_RE.test(stripped)) v = stripped;
  return EMAIL_RE.test(v) ? v : null;
}

const TABLES = [
  { table: 'venues', col: 'email' },
  { table: 'organizations', col: 'email' },
  { table: 'hotels', col: 'email' },
  { table: 'marketplace_listings', col: 'contact_email' },
];
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

let total = 0;
let unrepairable = 0;
for (const { table, col } of TABLES) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=id,slug,${col}&${col}=ilike.*mailto*&order=id`;
    const res = await fetch(url, { headers: { ...headers, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`${table} read → HTTP ${res.status}: ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  let fixed = 0;
  for (const row of rows) {
    const before = row[col];
    const after = repair(before);
    if (!after || after === before) {
      unrepairable += 1;
      console.log(`SKIP ${table} ${row.id} ${row.slug ?? ''} ${JSON.stringify(before)} (not repairable without guessing)`);
      continue;
    }
    console.log(`${APPLY ? 'FIX ' : 'WOULD FIX'} ${table} ${row.id} ${row.slug ?? ''} ${before} -> ${after}`);
    if (APPLY) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${row.id}&${col}=eq.${encodeURIComponent(before)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ [col]: after }),
      });
      if (!res.ok) throw new Error(`${table} ${row.id} → HTTP ${res.status}: ${await res.text()}`);
    }
    fixed += 1;
  }
  total += fixed;
  console.error(`${table}: ${rows.length} matched, ${fixed} ${APPLY ? 'repaired' : 'repairable'}`);
}
console.error(`${APPLY ? 'Repaired' : 'Dry run: would repair'} ${total}; ${unrepairable} left unchanged.`);
