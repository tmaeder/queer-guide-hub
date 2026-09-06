-- Give the Kinktionary licence deindexes a recorded REASON.
--
-- WHAT IS WRONG. Three migrations deindexed pages whose prose had verbatim
-- overlap with the Kinktionary — which is licensed NON-COMMERCIAL while
-- queer.guide is commercial:
--
--   migration:kinktionary-verbatim-overlap-deindex
--   migration:kinktionary-overlap-deindex-complete
--   migration:kinktionary-prose-defect-retraction
--
-- 513 rows were taken down between them. 145 carry a `seo_deindex_reason`; the
-- rest carry NULL. A NULL reason is indistinguishable from an unexplained
-- deindex, so a licence takedown reads to any later reader — human or sweep —
-- as a page that could simply be republished.
--
-- THAT IS NOT HYPOTHETICAL AND IT HAS NOW HAPPENED TWICE. CLAUDE.md records
-- run_tag_thin_page_reindex republishing 82 such pages on 2026-08-30 (169
-- corpus-wide), which is why `seo_deindex_reason` is default-deny and only
-- 'thin' is ever auto-reversed. And on 2026-09-05 this repair programme's own
-- migrations republished four more — cuttlefish-method, fucklicking,
-- white-knight (kink-stamp-repair-2) and dick-on-a-stick (kink-stamp-repair) —
-- because they checked that a row carried an import stamp and never checked
-- WHY it was dark. Stamping the reason is what makes that mistake unavailable
-- rather than merely discouraged.
--
-- THE REASON VALUE IS THE ORIGINATING MIGRATION NAME, not a new label. That is
-- the convention the 145 already-stamped rows use, and inventing a second
-- spelling for the same fact would leave the corpus with two vocabularies for
-- one condition. It is also non-'thin', so run_tag_thin_page_reindex can never
-- reverse it — which is the entire point.
--
-- THE 7 REPUBLISHED ROWS ARE TRIAGED, NOT RE-DEINDEXED, and the evidence is in
-- the change log rather than in an assumption:
--
--   slug                   body written by              body length BEFORE
--   cuntification          kink-stamp-repair-2          0
--   cuttlefish-method      kink-stamp-repair-2          0
--   fucklicking            kink-stamp-repair-2          0
--   jerk-off-instructions  kink-stamp-repair-2          0
--   white-knight           kink-stamp-repair-2          0
--   dick-on-a-stick        kink-stamp-repair            0
--   foot-worship           disentangle-foot-worship     520 -> 689
--
-- Six of the seven had an EMPTY body when their current prose was written, and
-- the licence migrations' own after-state was also empty — so there was no
-- Kinktionary text to carry forward and the live prose is original. foot-worship
-- was rewritten by a separate editorial migration. None of the seven is a
-- licence exposure, so none is taken back down; taking down correct original
-- prose would be its own defect.
--
-- They do NOT get a `seo_deindex_reason`: that column states why a page is
-- DARK, and these are live. Writing a reason onto an indexed row would make the
-- column mean two different things. The triage is recorded in `tag_sources`
-- (is_public=false, never rendered) so the next reader finds the answer without
-- re-deriving it from the change log.
--
-- Set-based rather than per-row: this touches only seo_deindex_reason, which is
-- in no column-scoped trigger's list — no category_id write, so none of the
-- 27000 re-entrancy that forces the loop in the stamp-repair migrations.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:stamp-licence-deindex-reason', true);

do $mig$
declare
  v_stamped int; v_triaged int; v_bad int; v_before int;
begin
  create temp table _lic on commit drop as
  select l.tag_id, min(l.actor) as by_actor
    from public.tag_change_log l
   where l.actor in ('migration:kinktionary-verbatim-overlap-deindex',
                     'migration:kinktionary-overlap-deindex-complete',
                     'migration:kinktionary-prose-defect-retraction')
     and (l.before_data->>'seo_indexable') = 'true'
     and (l.after_data->>'seo_indexable') = 'false'
   group by l.tag_id;

  select count(*) into v_before from _lic;
  if v_before < 400 then
    raise exception 'licence stamp: change log yielded only % rows, expected ~513 — the audit trail moved', v_before;
  end if;

  -- 1. Dark and unstamped -> record WHY, using the originating migration name.
  update public.unified_tags t
     set seo_deindex_reason = d.by_actor
    from _lic d
   where t.id = d.tag_id
     and t.seo_indexable = false
     and t.seo_deindex_reason is null;
  get diagnostics v_stamped = row_count;

  -- 2. Republished since -> record the triage, do not take them back down.
  insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
  select t.id, 'editorial:general-knowledge',
         'Licence triage 20320101100000: deindexed by ' || d.by_actor ||
         ' for Kinktionary verbatim overlap, later republished. Change log shows the live '
         'long_description was written when the stored body was empty, so it is original '
         'text and not a licence exposure. Left indexable deliberately.',
         false
    from _lic d
    join public.unified_tags t on t.id = d.tag_id
   where t.seo_indexable = true
     and not exists (select 1 from public.tag_sources s
                      where s.tag_id = t.id and s.claim_summary like 'Licence triage 20320101100000%');
  get diagnostics v_triaged = row_count;

  -- ── Assertions ───────────────────────────────────────────────────────────
  -- No licence-deindexed row may still be dark with no reason.
  select count(*) into v_bad from _lic d join public.unified_tags t on t.id = d.tag_id
   where t.seo_indexable = false and t.seo_deindex_reason is null;
  if v_bad <> 0 then
    raise exception 'licence stamp: % row(s) are still dark with no reason', v_bad;
  end if;

  -- No stamped reason may be 'thin', which is the one value that auto-reverses.
  select count(*) into v_bad from _lic d join public.unified_tags t on t.id = d.tag_id
   where t.seo_deindex_reason = 'thin';
  if v_bad <> 0 then
    raise exception 'licence stamp: % row(s) carry the reversible reason', v_bad;
  end if;

  -- Nothing may have been taken down or put up by this migration.
  select count(*) into v_bad from _lic d join public.unified_tags t on t.id = d.tag_id
   where t.seo_indexable = true and t.seo_deindex_reason is not null;
  if v_bad <> 0 then
    raise exception 'licence stamp: % live row(s) were given a deindex reason', v_bad;
  end if;

  raise notice 'licence stamp: % dark rows stamped, % live rows triaged, % in scope',
    v_stamped, v_triaged, v_before;
end
$mig$;
