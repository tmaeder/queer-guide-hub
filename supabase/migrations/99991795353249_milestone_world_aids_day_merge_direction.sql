-- The published "First World AIDS Day" milestone (5acdd342, slug 1988-first-world-aids-day)
-- was merged by the 2026-08-01 dedup sweep INTO a draft twin (caf76bbb,
-- erster-welt-aids-tag-1988-12-01). Result: the published URL 301s to a draft that 404s.
-- Reverse the direction: the published row keeps, the draft drops.
--
-- The audit predates schema:1, so unmerge_entities cannot replay it. Steps:
--   1. remove the redirect that points the published slug at the draft
--   2. clear the published row's duplicate_of_id
--   3. null the draft's image_url when it carries no alt metadata: the audit-insert trigger
--      merge_gap_audit_trigger would otherwise copy it onto the published row (the only
--      gap-fillable field), and the milestone quality guard rejects a displayed image
--      without alt/source/license metadata. Here it is the auto-generated OG card for the
--      DRAFT slug (queer.guide/og/history/erster-welt-aids-tag-1988-12-01.png).
--   4. merge draft -> published through the real merge core
--      (_milestone_merge_core(keep, drop, actor): moves links/proposals, upserts the
--       redirect drop.slug -> keep, sets drop.duplicate_of_id, writes a schema:1 audit;
--       it does not touch status and needs no JWT)
-- Guarded on the current state so a re-run, or a concurrent fix, is a no-op.
--
-- CI REPLAY (edited after this applied on prod, 2026-11-22): `Critical paths` replays
-- migrations onto a nightly snapshot that EXCLUDES draft rows, so there the published row
-- still points at a draft that is not present. Steps 1-2 are still right (the published row
-- must not point at a missing row); the merge and its checks need the draft, so they run
-- only when it exists. On prod the draft exists and nothing changes.

do $$
declare
  v_bad   int;
  v_pub   constant uuid := '5acdd342-fe6b-4b17-9459-d39f1c096067';
  v_draft constant uuid := 'caf76bbb-5a34-4124-bb05-c182d7e4e572';
begin
  if not exists (select 1 from public.milestones where id = v_pub and duplicate_of_id = v_draft) then
    raise notice 'WAD milestone merge already reversed or changed; skipping';
    return;
  end if;

  delete from public.milestone_slug_redirects
  where old_slug = '1988-first-world-aids-day' and milestone_id = v_draft;

  update public.milestones set duplicate_of_id = null where id = v_pub;

  update public.milestones set image_url = null
  where id = v_draft and image_url is not null and nullif(btrim(image_metadata->>'alt'), '') is null;

  if not exists (select 1 from public.milestones where id = v_draft) then
    raise notice 'WAD draft milestone absent (snapshot without drafts); dangling pointer cleared, merge skipped';
    return;
  end if;

  perform public._milestone_merge_core(v_pub, v_draft, null::uuid);

  -- How-it-was-done checks: only meaningful when this migration did the work.
  select count(*) into v_bad from public.milestone_slug_redirects
  where old_slug = 'erster-welt-aids-tag-1988-12-01'
    and milestone_id = '5acdd342-fe6b-4b17-9459-d39f1c096067';
  if v_bad <> 1 then raise exception 'P3 failed: draft slug does not redirect to the published row'; end if;

  select count(*) into v_bad from public.milestones
  where id = 'caf76bbb-5a34-4124-bb05-c182d7e4e572'
    and duplicate_of_id = '5acdd342-fe6b-4b17-9459-d39f1c096067';
  if v_bad <> 1 then raise exception 'P4 failed: draft is not merged into the published row'; end if;

  select count(*) into v_bad from public.milestones
  where id = '5acdd342-fe6b-4b17-9459-d39f1c096067' and image_url is not null;
  if v_bad <> 0 then raise exception 'P5 failed: published row picked up an unreviewed image'; end if;
end $$;

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from public.milestones
  where id = '5acdd342-fe6b-4b17-9459-d39f1c096067'
    and (duplicate_of_id is not null or status <> 'published');
  if v_bad <> 0 then raise exception 'P1 failed: published WAD milestone is not the keeper'; end if;

  select count(*) into v_bad from public.milestone_slug_redirects
  where old_slug = '1988-first-world-aids-day';
  if v_bad <> 0 then raise exception 'P2 failed: published slug still redirects'; end if;
end $verify$;
