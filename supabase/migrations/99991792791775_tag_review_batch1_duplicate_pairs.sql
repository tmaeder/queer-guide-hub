-- Review-queue batch 1 (2026-10-23): duplicate pairs the Review Queue sheet of
-- queerguide-unified_tags-2026-10-23_cleaned.xlsx stated in BOTH directions
-- (anti-trans-violence -> anti-transgender-violence AND the reverse), or that
-- 99991792778003 otherwise left in the inbox. The sheet could not say which side
-- to keep, so each direction was decided by hand against the live rows:
--   the published row (publication_role 'article' / seo_indexable) wins, then the
--   human-reviewed row, then usage, then the cleaner slug (no "(ABBR)" or "-etc"
--   suffix). 87 pairs.
--
-- Deliberately NOT merged, left in the queue for a person: chastity-cage /
-- cock-cage (a cock cage is one kind of chastity device), football / soccer
-- (football is ambiguous), health-care / health-services, the two female-
-- reproductive tags (different Wikidata entities, both links wrong),
-- zirkuskuenstler / zirkus (a performer is not the circus), mayonnaise (a
-- removal, not a merge), brats (pinned by e2e/tags-wrong-entity), cedar-springs-road
-- / cedar-springs (a person recorded them as distinct on 2026-09-20), and every
-- hedged note (canadian-bar, drag-brunch-queens, milf-hunter, personal-assistant
-- / personal-secretary, switchboard).
--
-- Same mechanics as 99991792778003: merge_tag_concept (audited, reversible with
-- unmerge_tag_concept), then the source's own aliases are repointed at the
-- canonical. The inbox rows for both sides of every merged pair are closed
-- (status 'rejected', which is how a tag-to-tag review row is dismissed) with the
-- resolution recorded in metadata.

set local statement_timeout = '30min';
select set_config('app.actor', 'migration:99991792791775_tag_review_batch1_duplicate_pairs', true);

select setval('public.tag_slug_redirects_id_seq',
              greatest((select coalesce(max(id), 1) from public.tag_slug_redirects),
                       (select last_value from public.tag_slug_redirects_id_seq)));

-- Collapse merge chains (a merged tag whose target is itself merged).
-- merge_tag_concept does not repoint earlier merges onto the new canonical, so
-- 99991792781503 left 12 such chains, which tag_merge_graph_signals() counts as
-- target_merged (a zero-invariant). Repoint each to its terminal canonical.
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

create temp table _b1 (src text primary key, tgt text not null) on commit drop;
insert into _b1 values
('anti-transgender-violence','anti-trans-violence'),
('beach-location','beach-area'),
('bisexual-flag','bisexual-pride-flag'),
('bondage-and-discipline-b-d','bondage-and-discipline'),
('california-bar','bar'),
('california-cafes','cafe'),
('carmel-bar','bar'),
('charcuterie-plate','charcuterie-board'),
('community-gathering','community-event'),
('consensual-non-monogamy','ethical-non-monogamy'),
('cultural-competency','cultural-competence'),
('d-s-dominance-and-submission','d-s'),
('dallas-gay-bar','gay-bar'),
('damsels-in-distress','damsel-in-distress'),
('ddlg-kink-dynamic','ddlg'),
('deepthroat','deep-throating'),
('devon-bar','bar'),
('domestic-discipline-dd','domestic-discipline'),
('drag-king-contest','drag-king-competition'),
('dyspareunia-painful-intercourse','dyspareunia'),
('faggot-fag','faggot'),
('femme-daddy','femdaddy'),
('freely-given-reversible-informed-enthusiastic-specific-fries','fries'),
('ftm-f2m','ftm-female-to-male'),
('gender-based-discrimination','gender-discrimination'),
('gender-identity-disorder-gid','gender-identity-disorder'),
('gender-minority-identity','gender-minority'),
('gender-neutral-restrooms','gender-neutral-bathroom'),
('gender-non-conforming-gnc','gnc'),
('gender-non-conformity','gender-nonconformity'),
('glbt-support','lgbtq-support'),
('greyromantic','grayromantic'),
('gynosexual','gynesexual'),
('hate-crime-legislation','hate-crime-laws'),
('he-him-himself','he-him'),
('hiv-sti-risk','hiv-and-sti-risk'),
('hypnosis-play','hypno-play'),
('intersex-conditions','intersex-variations'),
('intersex-flag','intersex-pride-flag'),
('jugend','youth'),
('known-donors-reproduction','known-donors'),
('labia-majora-and-minora','labia'),
('lgbt-community-centre','lgbtq-community-centers'),
('lgbtq-blood-donors','lgbtq-blood-donation'),
('lgbtq-clubs-co-parents-etc','lgbtq-clubs-co-parents'),
('lgtbi','lgbti'),
('mexican-food','mexican-cuisine'),
('nigerian-restaurant','nigerian-cuisine'),
('nipple-suction-cups','nipple-suckers'),
('nudist-living','nudist-lifestyle'),
('oral','oral-sex'),
('performance-space','performance-venue'),
('post-traumatic-stress-disorder-ptsd','post-traumatic-stress-disorder'),
('pre-exposure-prophylaxis-prep','prep'),
('prix-fixe-menu','set-meals'),
('psychedelic-assisted-therapy','psychedelic-therapy'),
('public-park','park'),
('publishing-house','publisher'),
('queer-festival','lgbtq-festival'),
('queer-owned-businesses','queer-owned'),
('queer-support','lgbtq-support'),
('queerplatonic-relationship-qpr','queerplatonic-relationship'),
('questioning','questioning-sexuality-and-gender'),
('right-to-vote-and-equal-suffrage','right-to-vote'),
('roleplaying','roleplay'),
('safe-sane-and-consensual-ssc','ssc'),
('same-gender-loving-sgl','same-gender-loving'),
('same-sex-attracted-ssa','same-sex-attraction-ssa'),
('sapiosexuality','sapiosexual'),
('slang-and-vernacular','slang'),
('social-anxiety-disorder-sad','social-anxiety-disorder'),
('social-event','social'),
('soft-dom-me','soft-dom-soft-domme'),
('sploshing','splosh'),
('stonewall-uprising','stonewall-riots'),
('submissive-sub','submissive'),
('supportive','lgbtq-supportive'),
('swallow','swallowing'),
('thai-capital','bangkok'),
('top-bottom','top-and-bottom'),
('transformation-fetish','transformation'),
('transgender-rights','trans-rights'),
('turkiye','turkey'),
('tv-host','tv-presenter'),
('usa','united-states'),
('washington-d-c','washington-dc'),
('zoloft','sertraline');

create temp table _b1_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from _b1 r
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where s.id <> t.id
  and not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id))
  and not exists (select 1 from public.unified_tags u
                  where u.id in (s.id, t.id) and u.publication_role = 'entity_redirect'
                    and (case u.canonical_entity_type
    when 'personality' then (select '/personalities/'||x.slug from public.personalities x where x.id=u.canonical_entity_id and x.duplicate_of_id is null)
    when 'city' then (select '/city/'||x.slug from public.cities x where x.id=u.canonical_entity_id and x.duplicate_of_id is null)
    when 'country' then (select '/country/'||x.slug from public.countries x where x.id=u.canonical_entity_id and x.duplicate_of_id is null)
    when 'village' then (select '/villages/'||x.slug from public.queer_villages x where x.id=u.canonical_entity_id and x.duplicate_of_id is null)
    when 'venue' then (select '/venues/'||x.slug from public.venues x where x.id=u.canonical_entity_id and x.duplicate_of_id is null)
    when 'organization' then (select '/organizations/'||x.slug from public.organizations x where x.id=u.canonical_entity_id and x.duplicate_of_id is null)
    when 'event' then (select '/events/'||x.slug from public.events x where x.id=u.canonical_entity_id and x.duplicate_of_id is null)
    when 'hotel' then (select '/hotels/'||x.slug from public.hotels x where x.id=u.canonical_entity_id and x.duplicate_of_id is null)
    when 'community_group' then (select '/groups/'||x.id::text from public.community_groups x where x.id=u.canonical_entity_id and x.duplicate_of_id is null)
  end) is distinct from u.canonical_entity_path);

create temp table _b1_done (src_id uuid, tgt_id uuid, src text, tgt text, audit_id uuid, err text) on commit drop;

do $merge$
declare r record; v_audit uuid;
begin
  for r in select * from _b1_pairs order by src loop
    begin
      update public.tag_category_assignments set is_primary = false
       where tag_id = r.src_id and is_primary;
      v_audit := public.merge_tag_concept(r.tgt_id, r.src_id,
                   'migration:99991792791775', 'excel-review-batch1-2026-10-23');
      delete from public.tag_aliases a
       using public.unified_tags c
       where a.canonical_tag_id = r.src_id and c.id = r.tgt_id
         and lower(btrim(a.alias_name)) = lower(btrim(c.name));
      update public.tag_aliases set canonical_tag_id = r.tgt_id
       where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b1_done values (r.src_id, r.tgt_id, r.src, r.tgt, v_audit, null);
    exception when others then
      insert into _b1_done values (r.src_id, r.tgt_id, r.src, r.tgt, null, sqlerrm);
      raise notice 'batch1 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

-- Close the inbox rows for both sides of each merged pair.
update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', 'merged ' || d.src || ' into ' || d.tgt,
         'resolved_by', 'migration:99991792791775')
  from _b1_done d
 where d.audit_id is not null
   and g.source = 'excel_review_2026_10_23' and g.entity_type = 'tag'
   and g.status = 'pending' and g.entity_id in (d.src_id, d.tgt_id);

do $verify$
declare v_sheet int; v_eligible int; v_ok int; v_err int; v_bad int;
begin
  select count(*) into v_sheet from _b1;
  select count(*) into v_eligible from _b1_pairs;
  select count(*) filter (where audit_id is not null), count(*) filter (where audit_id is null)
    into v_ok, v_err from _b1_done;
  raise notice 'batch1: % pairs, % eligible, % merged, % failed', v_sheet, v_eligible, v_ok, v_err;
  select count(*) into v_bad from _b1_done d join public.unified_tags s on s.id = d.src_id
   where d.audit_id is not null and (s.status <> 'merged' or s.merged_into_id is distinct from d.tgt_id);
  if v_bad <> 0 then raise exception 'batch1: % sources are not merged into their target', v_bad; end if;
  select count(*) into v_bad from _b1_done d join public.tag_aliases a on a.canonical_tag_id = d.src_id
   where d.audit_id is not null;
  if v_bad <> 0 then raise exception 'batch1: % aliases still point at a merged source', v_bad; end if;
  select count(*) into v_bad from _b1_done d join public.tag_suggestions g
      on g.entity_id in (d.src_id, d.tgt_id) and g.source = 'excel_review_2026_10_23'
   where d.audit_id is not null and g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch1: % inbox rows for merged pairs are still pending', v_bad; end if;
  if v_err > greatest(3, v_eligible * 0.05) then
    raise exception 'batch1: % of % eligible merges failed', v_err, v_eligible;
  end if;
  if v_eligible < v_sheet * 0.8 then
    raise exception 'batch1: only % of % pairs eligible; the corpus has drifted', v_eligible, v_sheet;
  end if;
end
$verify$;
