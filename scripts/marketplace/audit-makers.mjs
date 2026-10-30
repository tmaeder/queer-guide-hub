#!/usr/bin/env node
// Read-only audit of every published maker. No catalogue or profile mutations.
// Usage: SUPABASE_ACCESS_TOKEN=... node scripts/marketplace/audit-makers.mjs [--output report.json]
// On macOS, falls back to the existing Supabase CLI credential in Keychain.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const project = 'xqeacpakadqfxjxjcewc';
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Read-only maker profile/count/visibility audit. Optional: --output report.json');
  process.exit(0);
}
let token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
if (!token) {
  const stored = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  token = stored.startsWith('go-keyring-base64:')
    ? Buffer.from(stored.split(':')[1], 'base64').toString('utf8')
    : stored;
}
const query = readFileSync(new URL('./audit-makers.sql', import.meta.url), 'utf8');
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
if (!response.ok) throw new Error(`Maker audit failed: HTTP ${response.status}`);
const makers = await response.json();
const report = {
  checked_at: new Date().toISOString(),
  summary: {
    published_makers: makers.length,
    directory_makers: makers.filter((m) => m.product_count > 0).length,
    with_public_listings: makers.filter((m) => m.public_visible > 0).length,
    empty_despite_public_products: makers.filter(
      (m) => m.product_count > 0 && m.public_visible === 0 && m.public_rating_products > 0,
    ).length,
    only_opt_in_or_unrated: makers.filter(
      (m) => m.public_visible === 0 && m.actual_active > 0 && m.public_rating_products === 0,
    ).length,
    stale_counts: makers.filter((m) => m.product_count !== m.actual_active).length,
    missing_descriptions: makers.filter((m) => !m.has_description).length,
    missing_logos: makers.filter((m) => !m.has_logo).length,
  },
  makers,
};
const outputIndex = args.indexOf('--output');
if (outputIndex !== -1) {
  if (!args[outputIndex + 1]) throw new Error('--output requires a filename');
  writeFileSync(args[outputIndex + 1], JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report.summary, null, 2));
