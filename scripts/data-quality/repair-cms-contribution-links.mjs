#!/usr/bin/env node
/**
 * Link the "Get Involved" invitations in cms_pages bodies to the flows that
 * exist. /p/about lists "Add Venues", "Create Events" and "Join Discussions" as
 * bold plain text, so a visitor who decides to help has nowhere to click.
 *
 * This is CONTENT, so it is repaired in the data, not hardcoded in the
 * renderer. Only an exact `<strong>Label</strong>` that is not already inside a
 * link is wrapped; the visible wording is unchanged. Idempotent: a second run
 * finds nothing. "Spread the Word" has no flow and is left alone.
 *
 * Targets, all real routes (src/routes.tsx):
 *   Add Venues        -> /submit/venue   (ContributePage, venue form)
 *   Create Events     -> /submit/event   (ContributePage, event form)
 *   Join Discussions  -> /meet/groups    (community groups; there is no forum)
 *
 * Default is a dry run that lists affected rows. Writing needs --apply and
 * SUPABASE_SERVICE_ROLE_KEY. Reads use the anon key (published pages are
 * world-readable).
 *
 *   node scripts/data-quality/repair-cms-contribution-links.mjs
 *   node scripts/data-quality/repair-cms-contribution-links.mjs --apply
 */

export const LINKS = [
  ['Add Venues', '/submit/venue'],
  ['Create Events', '/submit/event'],
  ['Join Discussions', '/meet/groups'],
];

/** Pure: returns the repaired html and the labels it linked. */
export function linkInvitations(html) {
  let out = html ?? '';
  const linked = [];
  for (const [label, href] of LINKS) {
    const plain = `<strong>${label}</strong>`;
    const done = `<a href="${href}"><strong>${label}</strong></a>`;
    if (out.includes(plain) && !out.includes(done)) {
      out = out.split(plain).join(done);
      linked.push(label);
    }
  }
  return { html: out, linked };
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const readKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const writeKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const apply = process.argv.includes('--apply');
  if (!url || !readKey) {
    console.error('Set SUPABASE_URL and an anon or service key.');
    process.exit(2);
  }
  const res = await fetch(
    `${url}/rest/v1/cms_pages?select=id,slug,body_html&workflow_state=eq.published`,
    { headers: { apikey: readKey, Authorization: `Bearer ${readKey}` } },
  );
  if (!res.ok) {
    console.error(`Read failed: HTTP ${res.status}`);
    process.exit(2);
  }
  const rows = await res.json();
  const changes = rows
    .map((r) => ({ ...r, ...linkInvitations(r.body_html) }))
    .filter((r) => r.linked.length > 0);

  for (const c of changes) console.log(`${c.slug}: link ${c.linked.join(', ')}`);
  console.log(`${changes.length} of ${rows.length} published pages need links.`);
  if (!apply) {
    console.log('Dry run. Re-run with --apply to write.');
    return;
  }
  if (!writeKey) {
    console.error('--apply needs SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(2);
  }
  for (const c of changes) {
    const w = await fetch(`${url}/rest/v1/cms_pages?id=eq.${c.id}`, {
      method: 'PATCH',
      headers: {
        apikey: writeKey,
        Authorization: `Bearer ${writeKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ body_html: c.html }),
    });
    console.log(`${c.slug}: ${w.ok ? 'written' : `FAILED HTTP ${w.status}`}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
