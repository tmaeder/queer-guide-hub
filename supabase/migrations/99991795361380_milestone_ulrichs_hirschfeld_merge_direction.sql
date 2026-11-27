-- Three published milestones carry duplicate_of_id pointing at DRAFT milestones, so their
-- public /history/<slug> URLs 301 to drafts that 404:
--   51db5091 1867-karl-heinrich-ulrichs-calls-for-repeal-of-anti-homosexual -> draft 33424a3e
--   7f5edbd7 1867-karl-heinrich-ulrichs-defends-homosexuality-before-the     -> draft 33424a3e
--   68711fba 1897-magnus-hirschfeld-founds-the-scientific-humanitarian       -> draft b93d9240
--
-- Not made by the dedup sweep: the titles differ (its only milestone arm is an exact despaced
-- title + year), there is no entity_merge_audit row and no slug redirect. The pointers were
-- written when the 2026-07-21 history import was deduplicated against the then-existing
-- German curated rows, which were (and are) drafts. So unmerge_entities has nothing to
-- replay; this is the World AIDS Day repair (99991795353249) applied to the rest of the class.
--
-- The two Ulrichs rows are the same event (29 Aug 1867, Congress of German Jurists, Munich),
-- so un-merging both would recreate a duplicate pair. Keeper: 51db5091, by the rule the
-- 2026-08 milestone audit used (sources*10 + description length + country): both have one
-- source, a city and a country; 51db5091's description is longer (270 vs 214 chars).
-- 7f5edbd7 and the draft both merge into it. Hirschfeld: 68711fba keeps, the draft merges in
-- (its one milestone_link moves with it).
--
-- Steps per pair, as in 99991795353249: clear the published row's duplicate_of_id; null a
-- draft image_url lacking alt metadata (merge_gap_audit_trigger would copy it onto the
-- survivor and the image-metadata guard rejects it; both drafts have none today); merge
-- through _milestone_merge_core(keep, drop, null), which writes the redirect and a schema:1
-- audit. Guarded on current state, so a re-run or a concurrent fix is a no-op.
--
-- CI replay: `Critical paths` replays onto a snapshot without draft rows. There the
-- published rows still point at missing drafts; the pointers are cleared and the
-- published-into-published merge runs, the draft merges are skipped. The snapshot can also
-- lack a row's city or country: a row updated twice in one transaction has its FKs re-checked
-- (the pointer clear, then the merge), so the merges are skipped when any touched row's
-- city_id/country_id does not resolve. On prod every row resolves and nothing is skipped.

do $$
declare
  v_bad         int;
  v_ulrichs     constant uuid := '51db5091-79fc-415f-8043-d78bd1c60638';
  v_ulrichs_2   constant uuid := '7f5edbd7-4578-46c9-87b3-4d810fbf3bab';
  v_ulrichs_dr  constant uuid := '33424a3e-d81c-4508-91eb-b9bb38393f1b';
  v_hirsch      constant uuid := '68711fba-c552-4ae5-a777-12f209f09712';
  v_hirsch_dr   constant uuid := 'b93d9240-aa16-4291-9595-9e9bd1e867cf';
  v_geo_missing boolean;
begin
  -- Ulrichs ----------------------------------------------------------------
  if exists (select 1 from public.milestones where id = v_ulrichs and duplicate_of_id = v_ulrichs_dr)
     and exists (select 1 from public.milestones where id = v_ulrichs_2 and duplicate_of_id = v_ulrichs_dr) then

    update public.milestones set duplicate_of_id = null where id in (v_ulrichs, v_ulrichs_2);

    select exists (select 1 from public.milestones m
                   where m.id in (v_ulrichs, v_ulrichs_2, v_ulrichs_dr)
                     and ((m.city_id is not null and not exists (select 1 from public.geo_city_profiles g where g.place_id = m.city_id))
                       or (m.country_id is not null and not exists (select 1 from public.geo_country_profiles g where g.place_id = m.country_id))))
      into v_geo_missing;
    if v_geo_missing then
      raise notice 'Ulrichs rows reference absent geo rows (snapshot); pointers cleared, merges skipped';
    else
    perform public._milestone_merge_core(v_ulrichs, v_ulrichs_2, null::uuid);

    if exists (select 1 from public.milestones where id = v_ulrichs_dr) then
      update public.milestones set image_url = null
      where id = v_ulrichs_dr and image_url is not null and nullif(btrim(image_metadata->>'alt'), '') is null;
      perform public._milestone_merge_core(v_ulrichs, v_ulrichs_dr, null::uuid);

      select count(*) into v_bad from public.milestones
      where id = v_ulrichs_dr and duplicate_of_id = v_ulrichs;
      if v_bad <> 1 then raise exception 'P3 failed: Ulrichs draft is not merged into 51db5091'; end if;
    else
      raise notice 'Ulrichs draft absent (snapshot without drafts); draft merge skipped';
    end if;

    select count(*) into v_bad from public.milestone_slug_redirects
    where old_slug = '1867-karl-heinrich-ulrichs-defends-homosexuality-before-the' and milestone_id = v_ulrichs;
    if v_bad <> 1 then raise exception 'P4 failed: second Ulrichs slug does not redirect to 51db5091'; end if;
    end if;
  else
    raise notice 'Ulrichs milestones already repaired or changed; skipping';
  end if;

  -- Hirschfeld -------------------------------------------------------------
  if exists (select 1 from public.milestones where id = v_hirsch and duplicate_of_id = v_hirsch_dr) then
    update public.milestones set duplicate_of_id = null where id = v_hirsch;

    select exists (select 1 from public.milestones m
                   where m.id in (v_hirsch, v_hirsch_dr)
                     and ((m.city_id is not null and not exists (select 1 from public.geo_city_profiles g where g.place_id = m.city_id))
                       or (m.country_id is not null and not exists (select 1 from public.geo_country_profiles g where g.place_id = m.country_id))))
      into v_geo_missing;
    if v_geo_missing then
      raise notice 'Hirschfeld rows reference absent geo rows (snapshot); pointer cleared, merge skipped';
    elsif exists (select 1 from public.milestones where id = v_hirsch_dr) then
      update public.milestones set image_url = null
      where id = v_hirsch_dr and image_url is not null and nullif(btrim(image_metadata->>'alt'), '') is null;
      perform public._milestone_merge_core(v_hirsch, v_hirsch_dr, null::uuid);

      select count(*) into v_bad from public.milestones
      where id = v_hirsch_dr and duplicate_of_id = v_hirsch;
      if v_bad <> 1 then raise exception 'P5 failed: Hirschfeld draft is not merged into 68711fba'; end if;
    else
      raise notice 'Hirschfeld draft absent (snapshot without drafts); draft merge skipped';
    end if;
  else
    raise notice 'Hirschfeld milestone already repaired or changed; skipping';
  end if;
end $$;

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from public.milestones
  where id in ('51db5091-79fc-415f-8043-d78bd1c60638', '68711fba-c552-4ae5-a777-12f209f09712')
    and (duplicate_of_id is not null or status <> 'published');
  if v_bad <> 0 then raise exception 'P1 failed: a published keeper is still merged away'; end if;

  -- The whole class, not only these rows: no published milestone may point at a
  -- non-published one. A missing target (snapshot without drafts) counts too.
  select count(*) into v_bad from public.milestones d
  left join public.milestones k on k.id = d.duplicate_of_id
  where d.status = 'published' and d.duplicate_of_id is not null
    and k.status is distinct from 'published';
  if v_bad <> 0 then raise exception 'P2 failed: % published milestone(s) point at a non-published row', v_bad; end if;
end $verify$;
