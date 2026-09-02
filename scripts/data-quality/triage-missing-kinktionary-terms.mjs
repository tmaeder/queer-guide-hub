#!/usr/bin/env node
/**
 * Triage the Kinktionary terms that have no tag at all, by INDEPENDENT
 * ATTESTATION rather than by opinion.
 *
 * WHY THIS EXISTS RATHER THAN A MIGRATION THAT CREATES THEM
 *
 * 298 terms in the Kinktionary index resolve to no row in `unified_tags` under
 * any status. Creating them is not a data repair — it needs 298 ORIGINAL
 * DEFINITIONS, because the Kinktionary's own text is non-commercially licensed
 * and this is a commercial site. Most of the 298 are gender and orientation
 * microlabels (Demimasc, Pivotgender, Omnigender, Almondsexual) and kink roles,
 * where a wrong definition misstates someone's identity. Generating that prose
 * is exactly the failure this program spent its time retracting: 44 pages whose
 * bodies described a different subject entirely.
 *
 * FILING THEM AS SUGGESTIONS IS NOT AN OPTION EITHER, and that is measured, not
 * assumed. `tag_suggestions` looks like the right destination — it has
 * suggested_name, suggested_slug, reason, metadata. But `approve_tag_suggestions`
 * selects `... AND tag_id IS NOT NULL`, so it can only ATTACH AN EXISTING TAG to
 * an entity; it never creates a tag from suggested_name. History confirms the
 * consequence: of 18,558 rows, 17,811 are new-vocabulary proposals (tag_id null)
 * and EVERY ONE IS 'rejected' — a 0% approval rate across 17,811 attempts —
 * while every approved / auto_approved / pending row has a non-null tag_id.
 * The RPC also has no caller anywhere in `src/`. Filing 298 more would add to a
 * pile that has never once produced a tag.
 *
 * WHAT AN EDITOR ACTUALLY NEEDS
 *
 * Whether the term is attested OUTSIDE the Kinktionary. "Hijra" is a documented
 * South Asian third-gender identity with centuries of scholarship; "Fweeb" is a
 * single-community coinage. Both are legitimate entries in a kink glossary, but
 * only one of them justifies an indexable encyclopaedia page on a travel and
 * community platform, and only one can be written from sources.
 *
 * Wikidata is used as the attestation probe because it is free, keyless, and
 * asking "does an entity with this label exist" is a fact about the wider world,
 * not a judgement about the term. A hit is NOT a licence to auto-generate prose;
 * it means a human has somewhere to write from.
 *
 * This script WRITES NOTHING to the database. It produces a work-list.
 *
 * Usage:
 *   SUPABASE_ANON_KEY=... node scripts/data-quality/triage-missing-kinktionary-terms.mjs
 *
 * Output: scripts/data-quality/out/kinktionary-missing-terms.json
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNAL = join(HERE, 'kinktionary-term-index.json');
const OUT_DIR = join(HERE, 'out');
const OUT = join(OUT_DIR, 'kinktionary-missing-terms.json');

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY required');
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

async function pageAll(url) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${url}&limit=1000&offset=${offset}`, { headers: H });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

/**
 * Does Wikidata hold an entity whose LABEL is this term?
 *
 * Returns { attested, qid, label, description } or { unreachable: true }.
 * An unreachable probe is never reported as "not attested" — absence of
 * evidence would otherwise be recorded as evidence of absence, which is the
 * mistake that made an earlier sweep in this program report 429 unmeasured
 * pages as clean.
 */
async function probeWikidata(term) {
  const url =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*' +
    `&language=en&uselang=en&type=item&limit=5&search=${encodeURIComponent(term)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'queer.guide-glossary-triage/1.0 (https://queer.guide; ops@queer.guide)' },
    });
    if (r.ok) {
      const j = await r.json();
      const hit = (j.search || []).find((s) => norm(s.label) === norm(term));
      return hit
        ? { attested: true, qid: hit.id, label: hit.label, description: hit.description || null }
        : { attested: false };
    }
    await new Promise((s) => setTimeout(s, r.status === 429 ? 4000 * (attempt + 1) : 1200));
  }
  return { unreachable: true };
}

async function main() {
  const signal = JSON.parse(await readFile(SIGNAL, 'utf8'));

  const tags = await pageAll(
    'https://xqeacpakadqfxjxjcewc.supabase.co/rest/v1/unified_tags?select=slug,name&order=slug.asc',
  );
  const bySlug = new Set(tags.map((t) => t.slug));
  const byName = new Set(tags.map((t) => norm(t.name)));

  // Every status is checked, not just active: a term that exists as deprecated
  // or merged is a disposition already made, not a gap.
  const missing = signal.terms.filter(
    (t) => !bySlug.has(slugify(t.term)) && !byName.has(norm(t.term)),
  );
  process.stderr.write(`${tags.length} tags, ${signal.terms.length} terms, ${missing.length} missing\n`);

  const rows = [];
  for (const [i, t] of missing.entries()) {
    const section = (t.href || '').split('/')[2] || 'unknown';
    const probe = await probeWikidata(t.term);
    rows.push({ term: t.term, slug: slugify(t.term), section, ...probe });
    if ((i + 1) % 25 === 0) process.stderr.write(`  ${i + 1}/${missing.length}\n`);
    await new Promise((s) => setTimeout(s, 900));
  }

  // A LABEL MATCH IS NOT A SENSE MATCH, and this corpus proves it hard.
  //
  // wbsearchentities matches on the label, so a term that is also an ordinary
  // word, a surname or a title collides with the wrong entity — the identical
  // failure that put "Death is the irreversible cessation of biological
  // functions" on /tags/passing and a MiG-23 on /tags/flogger. Measured here:
  //
  //   Hijra   -> "the emigration of Muslims to the Islamic territory"
  //              NOT the South Asian third-gender identity
  //   Faggot  -> "family name"
  //   Maverick-> "family name"
  //   Squish  -> "2022 video game"
  //   Anaconda-> "short story by Horacio Quiroga"
  //
  // So `externally_attested` is an UPPER BOUND, never a work-list. Each row is
  // flagged when its own description betrays a different kind of thing, and the
  // flag is deliberately keyword-based and therefore incomplete — `Hijra` is
  // NOT caught by it, which is exactly why the count below is reported as
  // "needs reading" rather than as a verdict.
  const WRONG_SENSE =
    /(family name|surname|given name|video game|film|song|album|band|short story|novel|manga|anime|municipality|commune|genus|species)/i;
  for (const r of rows) {
    if (r.attested) r.senseSuspect = WRONG_SENSE.test(r.description || '');
  }

  const attested = rows.filter((r) => r.attested);
  const senseSuspect = attested.filter((r) => r.senseSuspect);
  const unattested = rows.filter((r) => r.attested === false);
  const unreachable = rows.filter((r) => r.unreachable);

  const bySection = {};
  for (const r of rows) {
    bySection[r.section] ??= { total: 0, attested: 0 };
    bySection[r.section].total += 1;
    if (r.attested) bySection[r.section].attested += 1;
  }

  const summary = {
    missing_terms: rows.length,
    externally_attested_UPPER_BOUND: attested.length,
    // Of those, the matched entity is plainly a different kind of thing.
    sense_suspect: senseSuspect.length,
    // Even this is an upper bound — the keyword flag misses Hijra.
    plausible_after_flagging_NEEDS_READING: attested.length - senseSuspect.length,
    kinktionary_only: unattested.length,
    unreachable_not_judged: unreachable.length,
    by_section: bySection,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ _summary: summary, rows }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
