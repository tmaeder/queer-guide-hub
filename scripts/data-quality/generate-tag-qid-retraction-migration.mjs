#!/usr/bin/env node
/**
 * Generate the QID-retraction migration from the reviewed decision file.
 *
 * The decision file (`out/decisions.json`) is the artifact a human reviews;
 * this script is the only thing that turns it into SQL. `--check` re-derives
 * the SQL and diffs it against the committed migration, so the two cannot
 * drift -- that check is what the unit test runs.
 *
 * Usage:
 *   node scripts/data-quality/generate-tag-qid-retraction-migration.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
export const DECISIONS = join(HERE, 'out', 'decisions.json')
export const MIGRATION = join(
  ROOT, 'supabase', 'migrations',
  '20261219100000_retract_wrong_wikidata_ids_on_tags.sql',
)

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)

/** Every slug whose wikidata_id is being retracted, with its evidence. */
export function retractions(decisions) {
  const out = []
  for (const d of decisions) {
    if (d.disposition !== 'wrong-qid' && d.disposition !== 'qid-belongs-to-neither') continue
    for (const slug of d.retract) {
      out.push({
        slug,
        qid: d.wikidata_id,
        label: d.qid_label,
        desc: d.qid_desc,
        reason: d.reason,
        disposition: d.disposition,
      })
    }
  }
  // Stable order so regeneration is byte-identical.
  out.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
  return out
}

export function buildSql(decisions) {
  const rows = retractions(decisions)
  const values = rows
    .map((r) => `  (${q(r.slug)}, ${q(r.qid)}, ${q(r.label)}, ${q(r.desc)}, ${q(r.reason)})`)
    .join(',\n')

  return `-- Retract wrong Wikidata identifiers from unified_tags.
--
-- 89 QIDs are shared by more than one ACTIVE tag. The brief that opened this
-- work read that as 83 merge candidates. It is not: for ${rows.length} of those rows the
-- QID denotes something the tag simply is not, so the two members are two
-- THINGS wearing one name, not two names for one thing. Merging them would
-- have destroyed a distinct concept apiece. The sharpest cases:
--
--   questioning        -> Q327018  "interrogation"  (law-enforcement questioning)
--   femminiello        -> Q1052281 "trans woman"    (a Neapolitan identity, not a synonym)
--   cunt               -> Q2192288 "vulva"          (a reclaimed slur vs an anatomy page)
--   teacher (Fetishes) -> Q37226   "teacher"        (the profession)
--   offering/submission-> Q76903164 "submission"    (submitting an item for approval)
--   man/male/boy/masc  -> Q6581097 "male"           (the P21 sex-or-gender VALUE, not a concept)
--
-- This is the namesake/wrong-sense class of 2026-08-29, one vocabulary later.
--
-- wikipedia_url goes WITH the QID. 28 of the ${rows.length} carry a live link to the wrong
-- article (questioning -> Interrogation, femminiello -> Trans_woman, cunt ->
-- Vulva); retracting the identifier while leaving the link published would keep
-- serving the wrong identity from the same page. tag_wikidata_repair_audit
-- already carries previous_wikipedia_url for exactly this reason.
--
-- Nothing is RE-RESOLVED. tag_medical_codes_sync and tag_wikidata_hierarchy
-- rebuild weekly from this identifier, so a plausible-but-wrong QID regenerates
-- wrong data forever while a null one regenerates nothing. Prefer NULL to a guess.
-- (Measured: 0 of these ${rows.length} currently carry a diagnostic code, so no clinical
-- claim is being unwound here -- but that is luck, not design.)
--
-- Prose is deliberately NOT touched. femminiello's description was overwritten
-- from the wrong entity and still opens "A trans woman ... assigned male at
-- birth"; that is real harm and it is a separate, reviewed pass, not a silent
-- side effect of a QID cleanup.
--
-- Merges are a SEPARATE migration. Retraction only nulls two columns; a merge
-- moves content and can carry the loser's category junction onto the winner.
-- Different risk, different change.
--
-- Generated from scripts/data-quality/out/decisions.json by
-- scripts/data-quality/generate-tag-qid-retraction-migration.mjs.
-- Do not hand-edit: src/lib/__tests__/tagQidRetraction.test.ts round-trips the two.

do $do$
declare
  v_audited int;
  v_cleared int;
  v_skipped int;
  v_left    int;
begin
  -- 30 of these rows are human_reviewed, and log_unified_tag_change() RAISEs
  -- when an undeclared system:% actor edits one. Declare a real actor so the
  -- before_data snapshot lands in tag_change_log and this stays reversible.
  perform set_config('app.actor', 'admin:tag-qid-retraction', true);

  create temp table _retract (
    slug   text primary key,
    qid    text not null,
    label  text,
    descr  text,
    reason text not null
  ) on commit drop;

  insert into _retract (slug, qid, label, descr, reason) values
${values};

  -- Only rows that STILL carry the audited identifier are touched. A row that
  -- moved under a concurrent session is skipped, not overwritten -- the same
  -- rule that let 20261008100000 compose with a hand pass running beside it.
  create temp table _target on commit drop as
    select t.id, t.slug, t.wikidata_id, t.wikipedia_url,
           r.label, r.descr, r.reason
      from public.unified_tags t
      join _retract r on r.slug = t.slug and r.qid = t.wikidata_id
     where t.status = 'active';

  select count(*) into v_skipped from _retract r
   where not exists (select 1 from _target g where g.slug = r.slug);

  insert into public.tag_wikidata_repair_audit
    (tag_id, disposition, previous_wikidata_id, previous_wikipedia_url,
     wikidata_label, wikidata_description, reason, repaired_at)
  -- 'cleared' is the disposition the 2026-08-29 repair used and the only one
  -- besides 'review' that tag_wikidata_repair_audit_disposition_check accepts;
  -- a new value is rejected by the CHECK (found by dry-running this on prod).
  --
  -- tag_id is the PRIMARY KEY here: this is one row per tag, not an append-only
  -- log. 8 of these tags already carry a row -- accipiosexual, boy, catgirl,
  -- event-organizer, group-masturbation, live-music-venue, play-room and
  -- questioning were all flagged disposition='review' by the 2026-08-29 pass,
  -- with the IDENTICAL previous_wikidata_id, and were never actioned. They have
  -- been publishing the wrong identity for the six days since. So the conflict
  -- arm upgrades review -> cleared and deliberately does NOT rewrite the
  -- previous_* columns: that is the first pass's recorded evidence, and an
  -- audit row you overwrite is an audit row you no longer have.
  select g.id, 'cleared', g.wikidata_id, g.wikipedia_url,
         g.label, g.descr, g.reason, now()
    from _target g
  on conflict (tag_id) do update
     set disposition = 'cleared',
         reason      = excluded.reason,
         repaired_at = now();
  get diagnostics v_audited = row_count;

  -- One statement over ${rows.length} rows. Each write enqueues into
  -- search_reindex_queue via the tag search trigger; at this size that is a
  -- rounding error, but do NOT widen this pattern to a four-figure sweep
  -- without batching it.
  update public.unified_tags t
     set wikidata_id  = null,
         wikipedia_url = null,
         updated_at   = now()
    from _target g
   where t.id = g.id;
  get diagnostics v_cleared = row_count;

  raise notice 'qid retraction: % audited, % cleared, % skipped (moved under us)',
    v_audited, v_cleared, v_skipped;

  -- Re-assert the condition this migration exists to fix, rather than trusting
  -- the row counts above. Every slug named here must no longer carry the QID it
  -- was retracted from. A row that MOVED to a different identifier is fine; a
  -- row still sitting on the wrong one is not.
  select count(*) into v_left
    from public.unified_tags t
    join _retract r on r.slug = t.slug and r.qid = t.wikidata_id
   where t.status = 'active';

  if v_left <> 0 then
    raise exception
      'tag QID retraction incomplete: % active tag(s) still carry the retracted identifier', v_left;
  end if;

  if v_cleared <> v_audited then
    raise exception 'audit/clear mismatch: % audited but % cleared', v_audited, v_cleared;
  end if;
end $do$;
`
}

// Run the CLI only when executed directly. Importing this module MUST be free
// of side effects: the round-trip test imports buildSql, and while this block
// ran on import it rewrote the migration from decisions.json before the
// assertions read it -- silently repairing any drift the test existed to catch.
// Mutation-testing found it (the actor was reverted mid-run); nothing else would.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
const decisions = JSON.parse(readFileSync(DECISIONS, 'utf8'))
const sql = buildSql(decisions)

if (process.argv.includes('--check')) {
  const on_disk = readFileSync(MIGRATION, 'utf8')
  if (on_disk !== sql) {
    console.error('DRIFT: the migration does not match what decisions.json generates.')
    process.exit(1)
  }
  console.log(`ok - migration matches decisions.json (${retractions(decisions).length} retractions)`)
} else {
  writeFileSync(MIGRATION, sql)
  console.log(`wrote ${MIGRATION} (${retractions(decisions).length} retractions)`)
}
}
