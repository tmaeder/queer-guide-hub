-- A sentinel for the prose a disowned Wikidata entity left behind.
--
-- WHY THIS IS NOT COVERED BY WHAT ALREADY EXISTS. There are two halves to the
-- wrong-entity failure and only one of them is watched:
--
--   the IDENTIFIER  tag_wikidata_repair_regressions() already fires when a QID
--                   a repair removed comes back on the same row.
--   the PROSE       nothing watches this. 20360401100300 recorded the rule for
--                   `queerness` — NULLING THE IDENTIFIER DOES NOT UNPUBLISH THE
--                   PROSE IT PRODUCED — and 50200101100500 found it again on a
--                   third entity class: `suspension` was hand-diagnosed on
--                   2026-09-04 with the reason "Rope suspension. The QID is an
--                   administrative account ban", its QID was nulled, and the
--                   account-ban body it had produced kept serving. `spotter`
--                   the same, under 20261008100000 itself.
--
-- WHAT IT MEASURES, and it is mechanical rather than a judgement: an ACTIVE tag
-- whose short_description or long_description is byte-identical to the value it
-- carried at the moment a repair disowned its Wikidata entity. That is provable
-- from tag_wikidata_repair_audit joined to tag_change_log, with no model and no
-- opinion about whether any given sentence is wrong.
--
-- IT IS AN UPPER BOUND, NOT A DEFECT COUNT, and the difference is stated here
-- rather than left for a reader to assume. Measured 2026-09-14: 364 rows, 339
-- of them seo_indexable. A hand-read sample of 24 came back 11 clearly wrong
-- ("Family name or surname" on `bottom`, "2025 American surrealist film" on
-- `fucktoy`, "Small cushion for storing pins or needles" on `pincushion`), 3
-- borderline and 10 genuinely fine — the 2026-08-29 repair deliberately
-- retracted only prose that CONTRADICTED the row's own description, so some of
-- what survives is correct. Roughly 45%, about 165 rows. Re-measure with a
-- fresh hand-read sample before believing that ratio, including this one.
--
-- A RATCHET, NOT A ZERO-INVARIANT. The count can only be worked down by hand,
-- so failing on any non-zero value would fail on every run from the day it
-- ships, and a check that is always red is one people learn to scroll past —
-- the same reasoning that made the dedup backlog rule key on the MEDIAN age.
-- The health script therefore WARNS on the count and HARD-FAILS on growth:
-- growth means a producer is writing new prose from a disowned entity, which is
-- a live regression rather than a backlog.
--
-- A BROKEN PROBE IS REPORTED SEPARATELY FROM A CLEAN CORPUS. `probe_ok` and
-- `audit_rows` are distinct keys because an empty audit table, a revoked grant
-- and a genuinely repaired corpus all otherwise produce the same reassuring
-- zero — the lesson accessibility_contradictions and content_revision_signals
-- both record.
--
-- STANDALONE, not a new key on tag_hygiene_stats: that function is a long
-- CREATE OR REPLACE and adding a key means restating every other one by hand,
-- which is a merge-collision surface.
--
-- service_role ONLY. A SECURITY DEFINER aggregate granted to `authenticated` is
-- granted to every signed-in member of the site, and this one reads across the
-- whole tag corpus.

create or replace function public.tag_disowned_prose_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v jsonb;
begin
  with repaired as (
    select a.tag_id, a.repaired_at
      from public.tag_wikidata_repair_audit a
     where a.disposition = 'cleared'
  ),
  -- The prose as it stood when the identifier was taken away. `distinct on`
  -- takes the newest change-log row at or before the repair, which is the last
  -- state the disowned entity is responsible for.
  at_repair as (
    select distinct on (r.tag_id)
           r.tag_id,
           c.after_data->>'short_description' as sd_then,
           c.after_data->>'long_description'  as ld_then
      from repaired r
      join public.tag_change_log c
        on c.tag_id = r.tag_id and c.created_at <= r.repaired_at
     order by r.tag_id, c.created_at desc
  ),
  live as (
    select t.id, t.seo_indexable,
           coalesce(t.short_description,'') <> ''
             and t.short_description is not distinct from x.sd_then as sd_survives,
           coalesce(t.long_description,'')  <> ''
             and t.long_description  is not distinct from x.ld_then as ld_survives
      from at_repair x
      join public.unified_tags t on t.id = x.tag_id
     where t.status = 'active'
  )
  select jsonb_build_object(
    'probe_ok', true,
    -- Reported so a truncated or unreadable audit table is distinguishable
    -- from a corpus that has actually been cleaned.
    'audit_rows',          (select count(*) from public.tag_wikidata_repair_audit),
    'change_log_rows',     (select count(*) from public.tag_change_log),
    'active_repaired',     (select count(*) from live),
    'sd_surviving',        (select count(*) from live where sd_survives),
    'ld_surviving',        (select count(*) from live where ld_survives),
    'indexable_surviving', (select count(*) from live where (sd_survives or ld_survives) and seo_indexable),
    'measured_at',         now()
  ) into v;

  return v;
exception when others then
  -- Answer rather than throw, so the health script can tell a broken probe
  -- from a clean corpus instead of seeing an opaque 500.
  return jsonb_build_object('probe_ok', false, 'error', sqlerrm);
end;
$fn$;

revoke all on function public.tag_disowned_prose_signals() from public, anon, authenticated;
grant execute on function public.tag_disowned_prose_signals() to service_role;

comment on function public.tag_disowned_prose_signals() is
  'Active tags still publishing the prose a now-disowned Wikidata entity produced. '
  || 'Complements tag_wikidata_repair_regressions(), which watches the identifier rather than the text. '
  || 'An upper bound on the defect, not a count of it: a hand-read sample of 24 on 2026-09-14 was ~45% '
  || 'genuinely wrong. Ratchet, not a zero-invariant — warn on the count, fail on growth.';

do $verify$
declare
  v jsonb;
begin
  v := public.tag_disowned_prose_signals();

  if coalesce((v->>'probe_ok')::boolean, false) is not true then
    raise exception 'tag_disowned_prose_signals: probe failed on its own first run: %', v->>'error';
  end if;

  -- Every key the health script reads must exist, or the gate silently checks
  -- nothing. Asserted here rather than discovered in CI.
  if not (v ? 'audit_rows' and v ? 'active_repaired' and v ? 'sd_surviving'
          and v ? 'ld_surviving' and v ? 'indexable_surviving') then
    raise exception 'tag_disowned_prose_signals: missing a key the health check reads: %', v;
  end if;

  -- A positive control. If this returns zero on deploy the join is wrong, not
  -- the corpus clean: 50200101100500 repaired 26 rows by hand and left the rest
  -- of the cohort standing, so a zero here means the probe is not measuring
  -- what it claims to.
  if (v->>'audit_rows')::int = 0 then
    raise exception 'tag_disowned_prose_signals: the repair audit is empty — the probe has nothing to join against';
  end if;

  raise notice 'tag_disowned_prose_signals baseline: % sd, % ld, % indexable, of % active repaired rows',
    v->>'sd_surviving', v->>'ld_surviving', v->>'indexable_surviving', v->>'active_repaired';
end
$verify$;
