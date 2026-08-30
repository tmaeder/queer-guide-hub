-- `naturist` and `naturism` are one venue feature on two live tags.
--
-- Found by following the four unreviewed `tag_relations` left on tags this
-- programme touched: two of them pointed `clothing-optional` at `naturist` AND
-- `naturism` separately, which is the shape a duplicate makes when an ontology
-- engine tries to relate to both halves of it.
--
-- Same signature as `nonbinary`/`non-binary` (20261022100100), and the evidence is
-- stronger. Measured 2026-08-30:
--
--   both status='active'
--   both wikidata_id = Q152311   (the SAME entity — Naturism)
--   both category    = Venue Features & Policies
--   naturist  1,422 uses,  1,415 venues
--   naturism    572 uses,     57 venues
--   venues carrying BOTH: 57  ← every naturism venue is already a naturist venue
--
-- Perfect containment. `naturism` adds no venue that `naturist` does not already
-- have, so this cannot lose a tagging. And `naturist`'s own description opens
-- "Naturism is a lifestyle of practicing non-sexual social nudity" — the tag
-- describes the practice, not a person, which is the two collapsing in the data
-- rather than in my reading of it.
--
-- CANONICAL IS `naturist`, on the same rule as the nonbinary merge: the survivor
-- is the one with more uses, because `merge_tag_concept` rewrites the LOSER's slug
-- out of `tags[]` and out of `unified_tag_assignments`. Keeping `naturism` instead
-- would rewrite 1,415 venue rows and ~1,422 junction rows to reach an identical
-- end state. It is also the right label for this category — a venue is "naturist",
-- it is not "naturism".
--
-- BUT `naturism` HAS THE BETTER PROSE, so the merge is not enough on its own.
-- `naturist` has NO short_description at all and an empty long_description, while
-- `naturism` carries a clean 36-char summary and a 428-char body. Merging without
-- porting them would keep 1,415 venues pointed at the thinner page and quietly
-- destroy the better copy, since the loser's row stops rendering. The prose is
-- copied across FIRST, before the merge, so that if the merge is ever reversed
-- with `unmerge_tag_concept` the survivor keeps the improvement.
--
-- Guarded and idempotent throughout: if a sibling session has already merged
-- either direction, this skips. `merge_tag_concept` also handles
-- `unified_tag_assignments` (verified — after the nonbinary merge the loser had 0
-- junction rows and the repo has 0 junction rows on any dead tag), so the 572
-- assignment rows move with the 57 venue rows.

select set_config('app.actor', 'admin:merge-naturism-20260830', true);

do $mig$
declare
  v_canon uuid;
  v_dup   uuid;
  v_audit uuid;
begin
  select id into v_canon from public.unified_tags where slug = 'naturist';
  select id into v_dup   from public.unified_tags where slug = 'naturism';

  if v_canon is null or v_dup is null then
    raise notice 'merge_naturism: one side missing (canon=%, dup=%), skipping', v_canon, v_dup;
    return;
  end if;
  if exists (select 1 from public.unified_tags where id = v_dup and status = 'merged') then
    raise notice 'merge_naturism: already merged, skipping';
    return;
  end if;

  -- Port the better copy onto the survivor BEFORE the merge, and only where the
  -- survivor is actually missing it — a sibling session that has since written a
  -- real description for `naturist` must win over the copy.
  update public.unified_tags c
     set short_description = coalesce(nullif(btrim(c.short_description), ''), d.short_description),
         long_description  = coalesce(nullif(btrim(c.long_description),  ''), d.long_description),
         updated_at        = now()
    from public.unified_tags d
   where c.id = v_canon and d.id = v_dup;

  v_audit := public.merge_tag_concept(v_canon, v_dup, 'merge-naturism-20260830', 'manual');
  raise notice 'merge_naturism: merged, audit id % (unmerge_tag_concept to reverse)', v_audit;
end
$mig$;

do $verify$
declare v_n int; v_bad text;
begin
  -- One live tag for the concept, and it is the adjectival one.
  select count(*) into v_n from public.unified_tags
   where slug in ('naturist','naturism') and status = 'active';
  if v_n <> 1 then
    raise exception 'merge_naturism: expected exactly 1 active tag, found %', v_n;
  end if;

  select count(*) into v_n from public.unified_tags d
    join public.unified_tags c on c.id = d.merged_into_id
   where d.slug = 'naturism' and d.status = 'merged' and c.slug = 'naturist';
  if v_n <> 1 then
    raise exception 'merge_naturism: naturism does not resolve to naturist';
  end if;

  -- The survivor kept the better copy rather than inheriting a blank.
  select count(*) into v_n from public.unified_tags
   where slug = 'naturist'
     and coalesce(nullif(btrim(short_description), ''), null) is not null
     and coalesce(nullif(btrim(long_description),  ''), null) is not null;
  if v_n <> 1 then
    raise exception 'merge_naturism: naturist did not inherit the short/long description';
  end if;

  -- The loser's URL still resolves for the 57 venues that referenced it.
  select count(*) into v_n from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where t.slug = 'naturist' and a.alias_slug = 'naturism';
  if v_n <> 1 then
    raise exception 'merge_naturism: naturism was not preserved as an alias';
  end if;

  -- Nothing may still point at the merged tag, in either representation.
  select count(*) into v_n from public.venues where 'naturism' = any(tags);
  if v_n <> 0 then
    raise exception 'merge_naturism: % venue(s) still carry the merged slug', v_n;
  end if;
  select count(*) into v_n from public.unified_tag_assignments a
    join public.unified_tags u on u.id = a.tag_id where u.slug = 'naturism';
  if v_n <> 0 then
    raise exception 'merge_naturism: % junction row(s) still on the merged tag', v_n;
  end if;

  -- Exactly one primary junction row on the survivor (the two-primaries hazard).
  select count(*) into v_n from public.tag_category_assignments a
    join public.unified_tags t on t.id = a.tag_id
   where t.slug = 'naturist' and a.is_primary;
  if v_n <> 1 then
    raise exception 'merge_naturism: canonical has % primary junction rows, expected 1', v_n;
  end if;

  -- Repo-wide: no dead tag anywhere retains assignments. Cheap, and it is the
  -- invariant that proves merge_tag_concept covered the junction table.
  select count(*) into v_n from public.unified_tag_assignments a
    join public.unified_tags u on u.id = a.tag_id
   where u.status in ('merged','deprecated');
  if v_n <> 0 then
    raise exception 'merge_naturism: % assignment row(s) left on dead tags repo-wide', v_n;
  end if;
end
$verify$;
