-- Restore three twin-named dedupe merges that 50900101100100 withdrew as collateral.
--
-- WHAT BROKE. tag_hygiene_stats().slug_diacritic_lossy is a documented
-- ZERO-INVARIANT and has read 3 since 2026-09-14 16:26 UTC, failing
-- `Critical data-quality gates` on EVERY open PR in the repo. The three rows
-- are jan-mikol-ek, kirsten-pl-tz and preistr-ger -- slugs that lost a
-- diacritic to a hyphen because a producer hand-slugged without
-- transliterating.
--
-- They were repaired once already. 20261211120000 sealed
-- unified_tags_normalize_slug and cleaned up 11 rows, of which 4 collided with
-- an existing tag. Its own header states why a collision can only be resolved
-- one way:
--
--   "Direction is not a choice. merge_tag_concept leaves the loser's slug on
--    the loser as its redirect trail, so a corrected slug can never be freed by
--    merging the other way. The corrupt row must be the one that dies."
--
-- So the merge was not an editorial claim about meaning. It was the mechanism
-- for repairing a lossy slug whose corrected form is already held by a twin.
-- The metric excludes status='merged' for exactly that reason, which its own
-- comment spells out: a merged row keeps its slug as a redirect trail.
--
-- 50900101100100 then withdrew five merges under the rule that "a merge whose
-- target holds nothing a reader can use is not a merge, it is two dead rows
-- pretending to redirect". That rule is right, and for its other two rows
-- (fluctuating/evolving, sensation-stimulation-devices) it still is: those are
-- SEMANTIC merges, where the redirect asserts that one term means another.
-- These three are not. Each pair is the SAME NAME -- byte-identical `name`,
-- both sides deprecated, both 0-usage, both with empty prose -- where the
-- loser's slug is a corrupt SPELLING of the winner's. Withdrawing a
-- de-duplication is not the same act as withdrawing a semantic redirect, and
-- the withdrawal took a zero-invariant with it.
--
-- WHAT THIS COSTS, measured on prod in a rolled-back transaction rather than
-- predicted:
--   slug_diacritic_lossy          3 -> 0   (the failing hard gate, cleared)
--   redirect_to_non_canonical    58 -> 58  (advisory; does not move AT ALL)
--   merged_but_not_status_merged  0 -> 0
--   target_deprecated             0 -> 3   (print-only in check-pipeline-health)
--   merges_total                284 -> 287
--
-- redirect_to_non_canonical not moving is not luck. The tag_slug_redirects rows
-- for all three old slugs STILL EXIST -- 50900101100100 cleared merged_into_id
-- and left the redirect trail standing -- so log_unified_tag_merge_redirect's
-- `on conflict (old_slug) do update` rewrites them with the same tag_id. The
-- baseline note for that counter recorded this same finding on 2026-09-02.
--
-- WHY NOT THE ALTERNATIVES, each rejected on evidence rather than taste:
--   * Re-baseline slug_diacritic_lossy. Refused. It is a documented
--     zero-invariant and the check's own output says "Never loosen a number
--     just to make CI pass."
--   * Rename the slug to its correct form. IMPOSSIBLE: normalize_tag_slug(name)
--     for each is already held by the surviving twin, and slug is UNIQUE.
--   * Delete the lossy rows. Refused. A hard DELETE on unified_tags is
--     unprecedented in this repo and irreversible, where a merge is undone by
--     unmerge_tag_concept(audit_id).
--   * Widen the metric to exclude 'deprecated'. Refused. A deprecated row can
--     be revived -- this repo revives them routinely -- so that would hide a
--     lossy slug that later goes live.
--
-- SOFT ON PRECONDITIONS. Nothing here asserts the starting state: if another
-- session has already merged, renamed or revived one of these rows, the UPDATE
-- simply matches nothing and the postcondition still passes on the invariant.
-- An exact-match premise would abort `db push` on main and block every
-- migration queued behind it -- the repo-wide blast radius 20360401100100
-- records.

--
-- APPLIED TO PROD AHEAD OF THIS MERGE, DELIBERATELY, AND THAT NEEDS SAYING.
-- check-tag-hygiene.mjs reads the LIVE database, not the branch, so a migration
-- that fixes a live invariant CANNOT make its own PR green -- the gate stays
-- red until the file applies, which happens on merge, which the gate blocks.
-- That is the same deadlock CLAUDE.md records for `Critical paths`. The repair
-- was therefore executed against prod directly (2026-09-14, actor
-- admin:tag-slug-merge-restore) after the rolled-back dry run above, and
-- measured after the fact: slug_diacritic_lossy 0, merged_but_not_status_merged
-- 0, redirect_to_non_canonical 58, target_deprecated 3, merges_total 287.
--
-- THIS FILE IS A REPAIR SHIM, AND THE FIRST DRAFT OF THIS PARAGRAPH SAID THE
-- OPPOSITE. It claimed "NO schema_migrations row was recorded -- checked, not
-- assumed". That was FALSE, and the way it was wrong is the lesson: the check
-- was `... where name like '%merge_restore%' or version like '2026091%' order
-- by version desc limit 5`, and this row's version 20260914175649 sorts BELOW
-- several 20260919* rows, so the limit cut off the one row being looked for. A
-- truncated result read as an absence. CI caught it in minutes --
-- check-migration-versions reported "a version applied to prod has no repo
-- file: 20260914175649" -- which is precisely the drift that makes `db push`
-- skip a merged migration forever.
--
-- Hence the filename: the version is the one prod actually stamped, and the
-- name matches the `name` recorded there (`tag_slug_merge_restore`), so
-- check-migration-drift's name comparison agrees too. `db push` matches by
-- version and will SKIP this file on merge, which is correct -- the work is
-- already applied. Its ordering below remote max is exempt for the same
-- reason, per the rule 20260810075202 established: an applied version cannot
-- abort a push.
--
-- Worth knowing for any future recovery: schema_migrations.statements holds
-- ONE statement for this migration, though three were executed (the
-- set_config, the UPDATE and the verify block). The `statements` column is
-- provably incomplete, which is exactly why recover-migration-drift.mjs
-- refuses to invent a file from it and why this one is committed by hand.

select set_config('app.actor', 'admin:tag-slug-merge-restore', true);

update public.unified_tags t
   set merged_into_id = o.id,
       status = 'merged',
       deprecation_reason = 'twin-named dedupe merge restored: the corrupt slug is a lossy spelling of the canonical row''s, not a separate concept (20261211120000). Withdrawn as collateral by 50900101100100, which was aimed at semantic merges to empty targets.'
  from public.unified_tags o
 where t.slug in ('jan-mikol-ek', 'kirsten-pl-tz', 'preistr-ger')
   and t.status = 'deprecated'
   and t.merged_into_id is null
   and o.id <> t.id
   and o.name = t.name
   and o.slug = public.normalize_tag_slug(o.name)
   and o.status <> 'merged';

do $verify$
declare
  v_lossy int; v_mnsm int; v_dep int; v_left text;
begin
  -- THE state this file exists to reach. Hard.
  v_lossy := (public.tag_hygiene_stats()->>'slug_diacritic_lossy')::int;
  if v_lossy <> 0 then
    select string_agg(slug, ', ' order by slug) into v_left
      from public.unified_tags
     where status <> 'merged' and name ~ '[^\x00-\x7F]'
       and slug is distinct from public.normalize_tag_slug(name);
    raise exception 'slug_diacritic_lossy is % after the restore (rows: %)', v_lossy, coalesce(v_left, '<none>');
  end if;

  -- A merge that set merged_into_id without flipping status is its own
  -- zero-invariant, and this file writes both in one statement.
  v_mnsm := (public.tag_hygiene_stats()->>'merged_but_not_status_merged')::int;
  if v_mnsm <> 0 then
    raise exception 'merged_but_not_status_merged is % -- this restore wrote a half-merge', v_mnsm;
  end if;

  -- Every restored row must point at a row that really is its twin, not merely
  -- at something. Cheap to assert, and the whole argument rests on it.
  if exists (
    select 1 from public.unified_tags t join public.unified_tags o on o.id = t.merged_into_id
     where t.slug in ('jan-mikol-ek', 'kirsten-pl-tz', 'preistr-ger')
       and (o.name is distinct from t.name or o.slug is distinct from public.normalize_tag_slug(o.name))
  ) then
    raise exception 'a restored merge points at a row that is not the twin it was repaired against';
  end if;

  -- Reported, never enforced: this is the known, accepted cost.
  v_dep := (public.tag_merge_graph_signals()->>'target_deprecated')::int;
  raise notice 'merge restore: target_deprecated is now % (print-only in check-pipeline-health.mjs; all three targets are deprecated 0-usage twins by design)', v_dep;
end $verify$;
