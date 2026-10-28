#!/usr/bin/env node
// Sitemap freshness audit. Confirms each per-type sitemap returns 200, parses,
// and has at least N entries; for high-churn types it also asserts the freshest
// <lastmod> is within that type's maxAgeDays. A daily canary against stale or
// empty data-driven sitemaps.
//
// Default base is the Cloudflare Pages deployment, NOT the public queer.guide
// custom domain: Cloudflare bot management blocks GitHub Actions egress IPs
// (datacenter ASN) on the custom domain, so an Actions runner gets HTTP 403 for
// every sitemap there even though they serve fine to real traffic. pages.dev
// runs the identical Pages Functions against the same database, so it is a
// faithful target for a data-freshness check. Override with an arg or
// SITEMAP_BASE to audit a different origin.

const BASE = process.argv[2] ?? process.env.SITEMAP_BASE ?? 'https://queer-guide.pages.dev';

// maxAgeDays is only set for sitemaps fed by a continuous pipeline where a stale
// freshest-lastmod is a real signal (news: hourly; events: hourly; landings:
// regenerated). Evergreen / edit-driven types (venues, hotels, villages,
// personalities, tags, static) legitimately go weeks without a row changing, so
// asserting freshness on them only produces false alarms — they are checked for
// presence and a real non-emptiness floor instead.
//
// minEntries is a COLLAPSE DETECTOR, not a target. Each floor is roughly 60% of
// the live count measured on 2026-09-10, so ordinary churn never trips it but a
// generator that starts returning nothing does. Until that date most of this
// list sat at `minEntries: 0`, which meant an EMPTY SITEMAP PASSED — and three
// did in practice: blog served 0 entries against a table that does not exist,
// while hotels and villages had been frozen for 84 and 94 days. A floor of 0 is
// not a lenient floor, it is the absence of one.
//
// Live counts at the time of writing, for re-deriving these floors later:
// static 60 · venues 23,664 · events 3,023 · news 24,117 · personalities 1,458
// · places 2,713 · hotels 323 · villages 131 · tags 2,604 · landings 647
// · landmarks 1 · milestones 2,923 · tag-categories 54.
const SITEMAPS = [
  // 15 children since sitemap-brands.xml landed 2026-09-19. The floor tracks
  // the real count exactly, unlike the urlset floors below: children are added
  // by hand in sitemap.xml.ts and never churn, so "one fewer than yesterday"
  // is always a regression and never ordinary movement.
  { path: '/sitemap.xml', minEntries: 15, kind: 'index' },
  { path: '/sitemap-static.xml', minEntries: 40, kind: 'urlset' },
  { path: '/sitemap-venues.xml', minEntries: 15000, kind: 'urlset' },
  { path: '/sitemap-events.xml', minEntries: 1000, kind: 'urlset', maxAgeDays: 7 },
  // /news/* is a first-class indexed detail page. The comment that stood here
  // until 2026-09-10 said it was "de-indexed (hard 410 Gone), expect 0 entries"
  // and paired that with `minEntries: 0`. That was stale — public/_redirects
  // records the 410 handler being removed, and all three sampled slugs return
  // HTTP 200 — so the floor was dead on 24,117 URLs, 39% of the whole corpus.
  { path: '/sitemap-news.xml', minEntries: 10000, kind: 'urlset', maxAgeDays: 7 },
  // ~255 shows have at least one episode; 150 is the collapse floor.
  { path: '/sitemap-podcasts.xml', minEntries: 150, kind: 'urlset' },
  { path: '/sitemap-personalities.xml', minEntries: 800, kind: 'urlset' },
  { path: '/sitemap-places.xml', minEntries: 1500, kind: 'urlset' },
  { path: '/sitemap-hotels.xml', minEntries: 200, kind: 'urlset' },
  { path: '/sitemap-villages.xml', minEntries: 90, kind: 'urlset' },
  // Re-derived 2026-10-28: live 422. SECOND time this floor has outlived its
  // corpus — the 2026-10-14 revision below set 1000 against a then-live 1,211,
  // and an owner-directed editorial pass has since deindexed most of that.
  // The drop is DELIBERATE and fully attributed, which is what separates it from
  // the collapse this floor exists to catch. `tag_change_log` names the writers:
  // 99991792777267_tag_sensitive_proposals_excel_2026_10_23 deindexed 708 on
  // 10-23, 99991792772531_tag_redirect_targets_repair 104, and batch13/16 plus
  // four merges another ~56. All 708 of the big one were verified individually:
  // 708/708 are is_sensitive, 708/708 moved to publication_role='utility',
  // 708/708 carry a seo_deindex_reason, 0/708 are still indexable. Deindexing a
  // sensitive glossary term is this repo's documented convention (faggot,
  // shemale, breeder predate it), so the corpus is right and the floor was stale.
  // NOT a generator fault: the sitemap matches the database exactly
  // (422 = active AND seo_indexable AND publication_role='article', and
  // active+indexable+utility is 0, so the role IS the deindex driver).
  //
  // 350 is DERIVED, not chosen. The series was reconstructed out of
  // tag_change_log by replaying every seo_indexable flip backwards from the live
  // count rather than asserting stability: 1,295 (10-04) … 1,306 (10-22) → 478
  // (10-23) → 422 on 10-24, 10-25, 10-26, 10-27, 10-28 — one step change, then
  // exactly flat for five days. On a number that provably does not drift, the
  // previous revision's ratio is the right sensitivity to keep: 1000/1211 was
  // 82.6%, and 82.6% of 422 is 349. So a further fall of ~72 tags still reads as
  // a collapse, where the ~60% convention (≈253) would no longer detect one.
  //
  // Honest residue the previous comment could claim and this one cannot: it said
  // EVERY active-but-deindexed tag carries an attributed reason. Measured today
  // 20 of 6,596 carry none (6,292 publication_role:utility, 162
  // entity_redirect, 98 kinktionary migrations, 24 placeholder-stamp removal).
  // Twenty unattributed rows are a work list, not a reason to hold the floor.
  { path: '/sitemap-tags.xml', minEntries: 350, kind: 'urlset' },
  { path: '/sitemap-landings.xml', minEntries: 5, kind: 'urlset', maxAgeDays: 14 },
  // Previously absent from this list entirely, so nothing checked them at all.
  // Landmarks is content-limited rather than broken: only 6 landmark rows exist
  // and 5 are still needs_review, so 1 published URL is the honest number. The
  // floor is 1 so that losing the last one is still caught.
  { path: '/sitemap-landmarks.xml', minEntries: 1, kind: 'urlset' },
  { path: '/sitemap-milestones.xml', minEntries: 1500, kind: 'urlset' },
  { path: '/sitemap-tag-categories.xml', minEntries: 30, kind: 'urlset' },
  // Marketplace makers, new 2026-09-19. 871 approved brands carry a slug and at
  // least one listing (measured that day); 500 is the ~60% collapse floor.
  //
  // A floor here matters more than for most: this generator filters on
  // `status=eq.approved` while `fetchRows` reads with the SERVICE ROLE, which
  // bypasses RLS. If that filter were ever dropped the count would JUMP, not
  // collapse — so the floor cannot catch it, and the e2e asserts the ceiling
  // instead. What the floor catches is the opposite failure: the generator
  // returning nothing, which is exactly how sitemap-blog.xml served an empty
  // urlset at HTTP 200 for its entire life behind `minEntries: 0`.
  { path: '/sitemap-brands.xml', minEntries: 500, kind: 'urlset' },
];

const fail = (m) => {
  console.error(`  X ${m}`);
  return 1;
};
const pass = (m) => {
  console.log(`  ok ${m}`);
  return 0;
};

const daysSince = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
};

async function audit({ path, minEntries, kind, maxAgeDays }) {
  const url = `${BASE.replace(/\/$/, '')}${path}`;
  console.log(`\n${path}`);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    return fail(`fetch failed: ${err.message}`);
  }
  if (res.status !== 200) return fail(`HTTP ${res.status}`);
  pass(`HTTP 200`);

  const xml = await res.text();
  const entryRe = kind === 'index' ? /<sitemap>/g : /<url>/g;
  const entries = (xml.match(entryRe) ?? []).length;
  if (entries < minEntries) return fail(`${entries} entries (expected ≥ ${minEntries})`);
  pass(`${entries} entries`);

  if (kind === 'urlset' && entries > 0 && maxAgeDays != null) {
    const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    if (lastmods.length === 0) return fail('no <lastmod> elements');
    const freshest = Math.min(...lastmods.map(daysSince));
    if (freshest > maxAgeDays) {
      return fail(`freshest lastmod is ${freshest.toFixed(0)} days old (max ${maxAgeDays})`);
    }
    pass(`freshest lastmod ${freshest.toFixed(0)}d ago`);
  }
  return 0;
}

async function main() {
  console.log(`Sitemap freshness against ${BASE}`);
  let failures = 0;
  for (const s of SITEMAPS) failures += await audit(s);
  console.log('');
  if (failures === 0) {
    console.log(`PASS - all ${SITEMAPS.length} sitemaps`);
    process.exit(0);
  } else {
    console.error(`FAIL - ${failures} failure(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
