-- Excel review queue 2026-10-23, batch 10: the 16 overlaps rows batch 9 left for a person.
-- Runs after batch 9 (99991792825527). Decisions taken by a person on 2026-10-24.
--
--   * 4 merges, the less-used tag into the more-used one:
--       diverse -> mixed-crowd, eating-out -> food, dining -> food, club -> nightclub.
--     `club` and `nightclub` were both defined as a nightclub; `dance-club` stays
--     separate as the dancing-focused kind. The /people interest picker listed
--     `dining` by slug and now lists `food` (src/config/interestVocabulary.ts).
--   * queer-friendly, lgbtq-friendly and gay-friendly stay separate: five ingest
--     sources and the map filter write or read those exact slugs, and
--     gay-friendly is a narrower claim than queer-friendly.
--   * Already settled before this batch: inclusivity is merged into inclusion,
--     sauna-bathhouse into sauna, and the factual errors flagged on inclusion,
--     lgbtq-advocacy and freedom-of-expression were rewritten earlier.
--     freedom-of-expression vs freedom-of-speech is a recorded do-not-merge pair.
--   * Kept separate: news-education (news section) vs lgbtq-education (topic),
--     nudist (person) vs naturist (practice), gay-men (audience) vs gay
--     (orientation), gay-sauna vs bathhouse, civil-rights vs
--     civil-and-political-rights (the treaty category), rainbow vs pride-flag
--     (rainbow-flag-lgbt merges into pride-flag in batch 8), and antiretroviral
--     (drug class, asserted canonical by two e2e specs) vs antiretroviral-therapy.
--
-- All 16 inbox rows are closed, each with its resolution.

select set_config('app.actor', 'migration:99991792827641_tag_review_batch10_editorial_rows', true);

create temp table _b10_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values ('diverse','mixed-crowd'), ('eating-out','food'), ('dining','food'), ('club','nightclub')) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b10_done (src_id uuid, tgt_id uuid) on commit drop;

do $merge$
declare r record;
begin
  for r in select * from _b10_pairs loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      perform public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792827641', 'excel-review-batch10-2026-10-23');
      delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = r.src_id and c.id = r.tgt_id
         and lower(btrim(a.alias_name)) = lower(btrim(c.name));
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b10_done values (r.src_id, r.tgt_id);
    exception when others then
      raise notice 'batch10 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

create temp table _b10_close (slug text primary key, resolution text) on commit drop;
insert into _b10_close values
('queer-friendly',        'kept separate: queer-friendly, lgbtq-friendly and gay-friendly are distinct claims used by ingest and the map filter'),
('gay-friendly',          'kept separate: queer-friendly, lgbtq-friendly and gay-friendly are distinct claims used by ingest and the map filter'),
('sauna',                 'overlap resolved: sauna-bathhouse is merged into this tag; sauna-club stays separate'),
('inclusion',             'overlap resolved: inclusivity is merged into this tag and the description was rewritten'),
('lgbtq-advocacy',        'kept separate from lgbtq-activism; the description was rewritten'),
('freedom-of-expression', 'kept separate: recorded do-not-merge pair with freedom-of-speech; the description was rewritten'),
('news-education',        'kept separate: news section tag, distinct from the lgbtq-education topic'),
('nudist',                'kept separate: a person, distinct from naturist'),
('gay-men',               'kept separate: an audience, distinct from the gay orientation'),
('gay-sauna',             'kept separate: narrower than bathhouse'),
('civil-rights',          'kept separate: civil-and-political-rights names the treaty category'),
('rainbow',               'kept separate: rainbow-flag-lgbt is merged into pride-flag'),
('antiretroviral',        'kept separate: the drug class, distinct from antiretroviral-therapy'),
('dance-club',            'kept separate: club is merged into nightclub; dance-club is the dancing-focused kind'),
('mixed-crowd',           'overlap resolved: diverse is merged into this tag'),
('dining',                'merged into food');

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792827641')
  from _b10_close c
  join public.unified_tags t on t.slug = c.slug
 where g.entity_id = t.id and g.entity_type = 'tag'
   and g.source = 'excel_review_2026_10_23' and g.status = 'pending';

do $collapse$
declare n int;
begin
  loop
    update public.unified_tags m set merged_into_id = t.merged_into_id
      from public.unified_tags t
     where t.id = m.merged_into_id and m.status = 'merged' and t.status = 'merged'
       and t.merged_into_id is not null and t.merged_into_id <> m.id;
    get diagnostics n = row_count;
    exit when n = 0;
  end loop;
end
$collapse$;

do $verify$
declare v_bad int;
begin
  -- Each merge either landed or its source is already merged into the same target.
  select count(*) into v_bad
    from (values ('diverse','mixed-crowd'), ('eating-out','food'), ('dining','food'), ('club','nightclub')) r(src, tgt)
    join public.unified_tags s on s.slug = r.src
    join public.unified_tags t on t.slug = r.tgt
   where s.status <> 'merged' or s.merged_into_id is distinct from t.id or t.status <> 'active';
  if v_bad <> 0 then raise exception 'batch10: % merges did not land', v_bad; end if;

  select count(*) into v_bad from public.unified_tags m join public.unified_tags t on t.id = m.merged_into_id
   where m.status = 'merged' and t.status = 'merged';
  if v_bad <> 0 then raise exception 'batch10: % merged tags still point at a merged tag', v_bad; end if;

  -- None of the kept-separate tags was merged or retired by this batch. A slug absent
  -- from the corpus (a fresh or seeded database) is not a failure of this file.
  select count(*) into v_bad from public.unified_tags t
   where t.slug = any (array['queer-friendly','lgbtq-friendly','gay-friendly','dance-club',
      'antiretroviral','antiretroviral-therapy','nudist','naturist','gay-men','gay'])
     and t.status <> 'active';
  if v_bad <> 0 then raise exception 'batch10: % kept-separate tags are no longer active', v_bad; end if;

  select count(*) into v_bad from _b10_close c
    join public.unified_tags t on t.slug = c.slug
    join public.tag_suggestions g on g.entity_id = t.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch10: % inbox rows are still pending', v_bad; end if;
end
$verify$;
