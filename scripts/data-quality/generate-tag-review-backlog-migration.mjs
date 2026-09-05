#!/usr/bin/env node
/**
 * Generate the migration that drains the 2026-08-29 review backlog.
 *
 * The 2026-08-29 wrong-entity repair cleared 1,506 tags and routed 254 to
 * `tag_wikidata_repair_audit.disposition='review'` for a human. Nobody ever
 * came. 109 of those rows are still active and still carrying the identifier
 * that pass flagged; 94 of them are seo_indexable.
 *
 * Importing this module has no side effects -- the CLI is gated on being the
 * main module, because a top-level write regenerates the migration before the
 * round-trip test reads it and silently repairs the drift the test exists to
 * catch. (Not hypothetical: the first retraction generator did exactly that.)
 *
 * Usage: node scripts/data-quality/generate-tag-review-backlog-migration.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
export const DECISIONS = join(HERE, 'out', 'backlog-retractions.json')
export const NONACTIONS = join(HERE, 'out', 'backlog-nonactions.json')
export const MIGRATION = join(
  ROOT, 'supabase', 'migrations',
  '20270120100000_drain_tag_wikidata_review_backlog.sql',
)

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)

/** Rows whose identifier is being cleared, in a stable order. */
export function retractions(decisions) {
  return [...decisions].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
}

export function buildSql(decisions) {
  const rows = retractions(decisions)
  const indexable = rows.filter((r) => r.seo_indexable).length
  const values = rows
    .map((r) => `  (${q(r.slug)}, ${q(r.qid)}, ${q(r.wd_label)}, ${q(r.wd_desc)}, ${q(r.reason)})`)
    .join(',\n')

  return `-- Drain the 2026-08-29 wrong-entity review backlog.
--
-- That pass cleared 1,506 tags and routed 254 to
-- tag_wikidata_repair_audit.disposition='review' for a human to decide.
-- Nobody ever came. Six days on, 109 of those rows are still active and still
-- carrying the identifier the pass flagged, ${indexable} of them seo_indexable.
-- Finding a wrong link, filing it, and leaving it published is not a fix.
--
-- Judged the same way as the 89-group duplicate pass: against each QID's LIVE
-- Wikidata label, not against the flag. A 'review' verdict never meant "wrong",
-- it meant "unexamined" -- lgbtq-friendly and prostate-stimulator sit in this
-- same backlog and are both correct. Of the 109:
--
--   ${rows.length} retracted here      the identifier denotes a different thing
--   14 left for review     ambiguous, or still-open groups from the 89-group pass
--   47 kept untouched      correct, or defensibly broader/narrower
--
-- KEEPING 47 is the point. The first pass's own recorded lesson is that
-- auto-clearing "wrong-looking" concept QIDs was measured to destroy ~70%
-- correct links, so a QID that is merely broader (relationship -> interpersonal
-- relationship, self-harm -> self-injury, theater -> theatre) is left alone.
-- Only a demonstrably different entity is cleared.
--
-- What that looks like in practice:
--   switch      -> Q19610114 the NINTENDO SWITCH console
--   switching   -> Q1429051  shunting RAILWAY vehicles
--   mutha       -> Q212761   Al Muthanna Governorate, Iraq
--   restraints  -> Q56162322 a WIKIDATA-INTERNAL WikiProject page
--   scat        -> Q30015788 subcutaneous adipose tissue
--   support     -> Q861259   the canvas a painting is stretched on (u=201)
--   feeder      -> Q1048902  the BASEBALL pitcher
--   size-l/-s   -> Q9927/Q9956 letters of the Latin alphabet
--   schoolgirl  -> Q48942    "child studying in a school", on a Fetishes tag
--
-- That last one is why this is not cosmetic. An adult roleplay archetype must
-- never resolve to an identifier for a real child, and 'whore' (Fetishes)
-- pointing at Q14915751 "prostitute" mislabels sex workers with a kink term.
--
-- wikipedia_url is cleared with the identifier, for the reason 20270105100000
-- recorded: it is the redirect target of the same wrong lookup, so leaving it
-- keeps serving the wrong identity from the same page.
--
-- Nothing is re-resolved. tag_medical_codes_sync and tag_wikidata_hierarchy
-- rebuild weekly from this column, so a plausible-but-wrong id regenerates
-- wrong data forever while a null one regenerates nothing.
--
-- Generated from scripts/data-quality/out/backlog-retractions.json by
-- scripts/data-quality/generate-tag-review-backlog-migration.mjs.
-- Do not hand-edit: src/lib/__tests__/tagReviewBacklog.test.ts round-trips the two.

do $do$
declare
  v_audited int;
  v_cleared int;
  v_skipped int;
  v_left    int;
begin
  -- Many of these are human_reviewed, and log_unified_tag_change() RAISEs when
  -- an undeclared system:% actor edits one. Declare a real actor so the
  -- before_data snapshot lands in tag_change_log and this stays reversible.
  perform set_config('app.actor', 'admin:tag-review-backlog-drain', true);

  create temp table _drain (
    slug   text primary key,
    qid    text not null,
    label  text,
    descr  text,
    reason text not null
  ) on commit drop;

  insert into _drain (slug, qid, label, descr, reason) values
${values};

  -- Only rows STILL carrying the audited identifier are touched; anything a
  -- concurrent session moved is skipped rather than overwritten.
  create temp table _target on commit drop as
    select t.id, t.slug, t.wikidata_id, t.wikipedia_url, d.label, d.descr, d.reason
      from public.unified_tags t
      join _drain d on d.slug = t.slug and d.qid = t.wikidata_id
     where t.status = 'active';

  select count(*) into v_skipped from _drain d
   where not exists (select 1 from _target g where g.slug = d.slug);

  -- tag_id is the PRIMARY KEY of the audit table, and every row here ALREADY
  -- has one carrying disposition='review' from 2026-08-29. The conflict arm
  -- promotes review -> cleared and deliberately does not rewrite previous_*:
  -- that is the first pass's evidence, and an audit row you overwrite is an
  -- audit row you no longer have.
  insert into public.tag_wikidata_repair_audit
    (tag_id, disposition, previous_wikidata_id, previous_wikipedia_url,
     wikidata_label, wikidata_description, reason, repaired_at)
  select g.id, 'cleared', g.wikidata_id, g.wikipedia_url,
         g.label, g.descr, g.reason, now()
    from _target g
  on conflict (tag_id) do update
     set disposition = 'cleared',
         reason      = excluded.reason,
         repaired_at = now();
  get diagnostics v_audited = row_count;

  -- ${rows.length} rows in one statement. Each write enqueues into search_reindex_queue
  -- via the tag search trigger; at this size that is fine, but do not widen the
  -- pattern to a four-figure sweep without batching it.
  update public.unified_tags t
     set wikidata_id   = null,
         wikipedia_url = null,
         updated_at    = now()
    from _target g
   where t.id = g.id;
  get diagnostics v_cleared = row_count;

  raise notice 'review backlog drain: % audited, % cleared, % skipped',
    v_audited, v_cleared, v_skipped;

  -- Re-assert the condition this migration exists to fix.
  select count(*) into v_left
    from public.unified_tags t
    join _drain d on d.slug = t.slug and d.qid = t.wikidata_id
   where t.status = 'active';

  if v_left <> 0 then
    raise exception 'review backlog drain incomplete: % tag(s) still carry the retracted identifier', v_left;
  end if;
  if v_cleared <> v_audited then
    raise exception 'audit/clear mismatch: % audited but % cleared', v_audited, v_cleared;
  end if;
end $do$;
`
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const decisions = JSON.parse(readFileSync(DECISIONS, 'utf8'))
  const sql = buildSql(decisions)
  if (process.argv.includes('--check')) {
    if (readFileSync(MIGRATION, 'utf8') !== sql) {
      console.error('DRIFT: the migration does not match what backlog-retractions.json generates.')
      process.exit(1)
    }
    console.log(`ok - migration matches the decision file (${retractions(decisions).length} retractions)`)
  } else {
    writeFileSync(MIGRATION, sql)
    console.log(`wrote ${MIGRATION} (${retractions(decisions).length} retractions)`)
  }
}
