-- Cross-border same-name twins: one town stored twice under two countries.
--
-- Three pairs, each the same town held as two rows whose only real disagreement
-- is which country they are filed under. They were surfaced by
-- `city_country_polygon_conflicts` and hand-annotated on 2026-09-13 as NOT
-- country-repairable: moving either row into the other's country collides on
-- `uk_cities_country_name_active`. The nightly sweep cannot propose them either,
-- because its city arm blocks on country agreement and these two rows disagree
-- on exactly that -- which is correct behaviour for the arm and is why they need
-- a decision rather than a wider predicate.
--
--   Lyss             CH <- IT   1.6 km apart   keep Q69512
--   Les Trois-Ilets  MQ <- FR   2.8 km apart   keep Q1650786
--   Martigny         CH <- FR   0.45 km apart  keep Q68956
--
-- Identity was verified against Wikidata, not inferred from the rows:
--   Q69512    "Lyss"            town and municipality in the canton of Bern, P17=Q39 (Switzerland)
--   Q1650786  "Les Trois-Ilets" French commune in Martinique,                P17=Q142 (France)
--   Q68956    "Martigny"        municipality in the canton of Valais,        P17=Q39 (Switzerland)
--
-- Each drop row carries NO Wikidata id, and in two of three a `tmp-` slug and
-- `shell_status='placeholder'` -- the minted-shell signature. What makes these
-- merges rather than guesses is that a distinct same-named town cannot sit where
-- these sit: there is no Lyss in Italy at all, and France's Martignys (Aisne,
-- Manche) are ~500 km from 46.10/7.07, so a separate French Martigny 450 m from
-- the Valais one does not exist. Martinique IS France, so that pair is one
-- commune by construction rather than by measurement.
--
-- EVERY PAIR HAS THE SAME NAME. Nothing here merges two different names; the
-- standing invariant is re-asserted as a postcondition below.
--
-- Reversible: `merge_cities` stamps `details.moved` + `schema:1`, so
-- `unmerge_cities(<audit_id>, false)` replays the reparenting. Verified on the
-- live definition before this file was written.
--
-- DELIBERATELY NOT INCLUDED: the fourth open pair, "Concord " (US) against
-- "Concord" (CZ). Its 2026-09-13 note establishes that BOTH rows were enriched
-- from the same Wikipedia article (Concord, North Carolina) while the keep row
-- stores New Hampshire coordinates with no provenance for them and its only
-- personality names Concord, CALIFORNIA -- three places across two rows, with
-- neither row's identity established. Merging it would be the bare-name
-- namesake-chimera guess this engine exists to refuse. It stays open, and this
-- migration asserts that IT did not touch it.
--
-- Soft on preconditions, hard on postconditions: a pair already merged between
-- authoring and CI is skipped, not fatal. What is asserted is the state reached.

do $twins$
declare
  rec           record;
  v_merged      int := 0;
  v_skipped     int := 0;
  v_resolved    int := 0;
  v_bad         int;
  v_concord_before text;
  v_concord_after  text;
begin
  -- capture the Concord row's status BEFORE any write. Asserting "it is still
  -- open" would abort `db push` repo-wide if a human legitimately decided it
  -- between authoring and CI; asserting it is UNCHANGED across this transaction
  -- asserts exactly what belongs to this file -- that it kept its hands off.
  select status into v_concord_before
  from public.dedup_review_queue
  where id = '67bfd3fb-fa74-4047-a735-f6ff1b1839c5';

  for rec in
    with pairs(keep_id, drop_id, keep_qid, max_m) as (values
      ('b7f866a1-f223-48d6-ba42-74aff797e9a1'::uuid, 'f3facb28-1000-4460-8707-db04185d3352'::uuid, 'Q69512',   5000),
      ('c676e5db-71a2-4832-a1ee-d2101411d6ab'::uuid, '286cc3ba-e009-4869-b1b5-0f4b2ecb6b27'::uuid, 'Q1650786', 5000),
      ('018821ce-829b-4df1-a962-ecf5aeafe812'::uuid, '2da6b67b-fb97-4753-81a0-7e8ea24638ce'::uuid, 'Q68956',   5000))
    select p.keep_id, p.drop_id, k.name as keep_name, d.name as drop_name
    from pairs p
    join public.cities k on k.id = p.keep_id
    join public.cities d on d.id = p.drop_id
    where k.duplicate_of_id is null
      and d.duplicate_of_id is null
      -- re-verify identity at apply time rather than trusting the frozen ids
      and k.wikidata_qid = p.keep_qid
      and d.wikidata_qid is null
      and public.dedup_despace(k.name) = public.dedup_despace(d.name)
      and coalesce(public.haversine_m(k.latitude, k.longitude, d.latitude, d.longitude), 1e9) < p.max_m
    order by k.name
  loop
    begin
      perform public.merge_cities(rec.keep_id, rec.drop_id, false);
      v_merged := v_merged + 1;
      raise notice 'merged % <- %', rec.keep_name, rec.drop_name;
    exception when others then
      v_skipped := v_skipped + 1;
      raise notice 'skipped % <- % : %', rec.keep_name, rec.drop_name, sqlerrm;
    end;
  end loop;

  -- resolve the queue rows these merges answer. `approved`, not `rejected`:
  -- the proposals were correct, and recording a merged pair as rejected would
  -- be a false record AND permanent sweep memory against a true duplicate.
  update public.dedup_review_queue q
     set status        = 'approved',
         reviewed_at   = now(),
         reviewer_note = 'auto-merged: cross-border same-name twin resolved by migration '
                      || '51600101100000. Survivor carries the Wikidata id and the content; the '
                      || 'dropped row carried no gazetteer identifier and sat inside the survivor''s '
                      || 'own municipality. Reversible via unmerge_cities.'
    from public.cities d
   where d.id = q.drop_id
     and q.entity_type = 'city'
     and q.status = 'open'
     and q.id <> '67bfd3fb-fa74-4047-a735-f6ff1b1839c5'
     and d.duplicate_of_id is not null;
  get diagnostics v_resolved = row_count;

  ------------------------------------------------------------ postconditions
  -- 1. all three drop rows are now duplicates of their intended survivor.
  --    Asserted as the REACHED state, so a pair merged by someone else between
  --    authoring and CI still satisfies it.
  select count(*) into v_bad
  from (values
    ('b7f866a1-f223-48d6-ba42-74aff797e9a1'::uuid, 'f3facb28-1000-4460-8707-db04185d3352'::uuid),
    ('c676e5db-71a2-4832-a1ee-d2101411d6ab'::uuid, '286cc3ba-e009-4869-b1b5-0f4b2ecb6b27'::uuid),
    ('018821ce-829b-4df1-a962-ecf5aeafe812'::uuid, '2da6b67b-fb97-4753-81a0-7e8ea24638ce'::uuid)
  ) as want(keep_id, drop_id)
  join public.cities d on d.id = want.drop_id
  where d.duplicate_of_id is distinct from want.keep_id;
  if v_bad <> 0 then
    raise exception '% of 3 cross-border twins did not reach the merged state', v_bad;
  end if;

  -- 2. no OPEN city pair may name two different places. The qualifier form
  --    ("X" vs "X, <qualifier>") is the same name and is excluded.
  select count(*) into v_bad
  from public.dedup_review_queue q
  join public.cities ka on ka.id = q.keep_id
  join public.cities da on da.id = q.drop_id
  where q.entity_type = 'city' and q.status = 'open'
    and public.dedup_despace(ka.name) <> public.dedup_despace(da.name)
    and public.dedup_despace(regexp_replace(da.name, '\s*,\s*[^,]+$', '')) <> public.dedup_despace(ka.name)
    and public.dedup_despace(regexp_replace(ka.name, '\s*,\s*[^,]+$', '')) <> public.dedup_despace(da.name);
  if v_bad <> 0 then
    raise exception '% open city pairs still name two different places', v_bad;
  end if;

  -- 3. no open pair points at an already-merged row.
  select count(*) into v_bad
  from public.dedup_review_queue q
  join public.cities d on d.id = q.drop_id
  where q.entity_type = 'city' and q.status = 'open' and d.duplicate_of_id is not null;
  if v_bad <> 0 then
    raise exception '% open city pairs point at an already-merged row', v_bad;
  end if;

  -- 4. this migration did not touch Concord.
  select status into v_concord_after
  from public.dedup_review_queue
  where id = '67bfd3fb-fa74-4047-a735-f6ff1b1839c5';
  if v_concord_after is distinct from v_concord_before then
    raise exception 'Concord pair changed status % -> % inside this migration; it is undecidable and must not be touched',
      v_concord_before, v_concord_after;
  end if;

  raise notice 'cross-border twins: merged=% skipped=% queue_resolved=%',
    v_merged, v_skipped, v_resolved;
end
$twins$;
