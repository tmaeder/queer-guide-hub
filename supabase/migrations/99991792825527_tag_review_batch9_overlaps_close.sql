-- Excel review queue 2026-10-23, batch 9: closes the rest of the "overlaps only" rows.
-- Runs after batch 8 (99991792821862), which merges 196 same-concept pairs.
--
--   * 86 rows are the canonical side of a batch-8 merge. Each is closed only
--     if its named duplicate really is merged into it now.
--   * 29 rows whose named duplicate was already merged into them earlier
--     (ballroom -> ballroom-culture, queer-spot -> queer-space, ...). Same runtime check.
--   * 2 more merges: bio-power -> biopower-and-governmentality and
--     triple-penetration -> air-tight (one concept each).
--   * 121 low-usage rows are closed as "kept separate": each overlaps a related but
--     distinct tag (pianist vs piano, postpartum vs peripartum depression, kitten vs
--     kitten-play, tourist-attraction vs tourist-destination, ...), so no merge.
--
-- Left pending for a person: queer-friendly, sauna, news-education, gay-friendly, inclusion, nudist, rainbow, dance-club, gay-men, civil-rights, gay-sauna, mixed-crowd, dining, lgbtq-advocacy, antiretroviral, freedom-of-expression.
-- These carry the most usage or an e2e-asserted canonical, or the merge they ask for is a
-- recorded do-not-merge pair (freedom-of-expression).

select set_config('app.actor', 'migration:99991792825527_tag_review_batch9_overlaps_close', true);

create temp table _b9_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values ('bio-power','biopower-and-governmentality'), ('triple-penetration','air-tight')) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b9_done (src_id uuid, tgt_id uuid) on commit drop;

do $merge$
declare r record;
begin
  for r in select * from _b9_pairs loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      perform public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792825527', 'excel-review-batch9-2026-10-23');
      delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = r.src_id and c.id = r.tgt_id
         and lower(btrim(a.alias_name)) = lower(btrim(c.name));
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b9_done values (r.src_id, r.tgt_id);
    exception when others then
      raise notice 'batch9 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

-- canonical rows: (row slug, a duplicate that should now be merged into it)
create temp table _b9_canon (slug text, dup text) on commit drop;
insert into _b9_canon values
('adult','adult-oriented'),
('anal','anal-play'),
('counseling','counseling-and-support'),
('therapy','therapy-counseling'),
('pride-flag','rainbow-flag-lgbt'),
('pride-flag','lgbtq-pride-flags'),
('denim','denim-play'),
('pride-parade','pride-march'),
('bondage-gear','bdsm-restraints'),
('intersectional','lgbtq-intersectionality'),
('depression','major-depressive-disorder-mdd'),
('relaxed-atmosphere','comfortable-atmosphere'),
('duck','ducky'),
('gender-fluid','gender-fluidity'),
('trans-advocacy','trans-rights-activism'),
('electro','electroplay'),
('electro','electrode-punishments'),
('breakfast-option','breakfast-spot'),
('queer-history','history-of-homosexuality'),
('family-support','family-services'),
('family-support','family-resources'),
('lgbtq-inclusive','lgbtq-inclusion'),
('lgbtq-inclusive','queer-inclusive'),
('hiv-treatment','hiv-aids-care'),
('representation-in-media','media-culture-representation'),
('japanese','japanese-culture'),
('gender-role','gender-norms'),
('advocate','lgbtq-advocate'),
('leather-community','leather-scene'),
('indian-cuisine','indian-restaurant'),
('private-club','members-club'),
('vinyl','vinyl-clothing'),
('pvc','pvc-clothing'),
('cuffs','bondage-cuffs'),
('director','film-director'),
('employment-non-discrimination','employment-discrimination-protections'),
('employment-non-discrimination','employment-equality'),
('social-space','social-hub'),
('community-focused','community-oriented'),
('legal-gender-recognition','legal-transition'),
('testosterone-therapy','masculinizing-hormone-therapy'),
('aids-organizations','aids-information-centers'),
('boot','boot-kink'),
('sexual-behavior','sexual-activity'),
('systemic-racism','structural-racism'),
('systemic-racism','institutional-racism'),
('androgyny','androgynous'),
('lgbt-tourism','queer-travel'),
('lgbt-tourism','lgbtq-travel-destinations'),
('lgbtq-therapy','queer-counseling'),
('trauma-informed','trauma-informed-space'),
('bystander-intervention','active-bystander-training'),
('cultural-sensitivity','culturally-sensitive'),
('humiliation','humiliation-play'),
('lgbtq-arts','lgbtqia-literature-and-arts'),
('robot','robot-fetish'),
('closet','in-the-closet'),
('lgbtq-mental-health','queer-mental-health'),
('policy-reform','legal-and-policy-reform'),
('privacy-rights','right-to-privacy'),
('algolagnia','algophilia'),
('contraceptive-methods','contraception-family-planning'),
('corsetry','corsets'),
('female-dominance','dominant-women'),
('variations-of-sex-development-vsd','dsd-disorders-of-sex-development'),
('emotion','emotional-reaction'),
('frottage','frotting'),
('legal-gender-recognition','gender-identity-recognition'),
('legal-gender-recognition','gender-recognition-laws'),
('gender-inclusive','gender-inclusivity'),
('gender-conscious-parenting','gender-responsive-parenting'),
('genitals','external-genitalia'),
('herpes','herpes-simplex-virus-hsv'),
('indivisibility-of-rights','interdependence-of-rights'),
('legal-process','legal-procedures'),
('lesbian-symbols','lesbian-flags-symbols'),
('lgbt-symbols','lgbt-slogans-symbols'),
('mental-health-support','lgbtqia-mental-health-support'),
('lgbtqia-political-representation','queer-visibility-in-politics'),
('polygender','multigender'),
('non-penetrative-sex','outercourse'),
('nudist-body-art','nudist-body-painting'),
('nudist-camp','nudist-colony'),
('nudist-hiking-trail','nudist-nature-walk'),
('orgasm-control','orgasm-play'),
('overdose-prevention-education','safer-use-and-overdose-prevention-training'),
('performativity-and-resistance','political-potential-of-performativity'),
('prostate-stimulation','prostate-massage'),
('lgbtq-education','queer-inclusive-education'),
('family-support','queer-parenting-resources'),
('reproductive-system','reproductive-anatomy'),
('rubber-fetish','rubberism'),
('sensory-play','sensual-play'),
('sex-repulsed','sex-repulsed-asexual'),
('sexual-compulsivity','sexual-addiction'),
('vacuum-pump','vacuum-pumping'),
('biopower-and-governmentality','bio-power'),
('air-tight','triple-penetration'),
('ballroom-culture',null),
('bisexual-activism',null),
('bi-community',null),
('bisexual-movement',null),
('sexual-consent-in-chemsex-settings',null),
('community-space',null),
('gender-variance',null),
('grassroots-movement',null),
('health-advocacy',null),
('inclusive-space',null),
('interracial',null),
('lesbian-linguistics',null),
('gay-slang',null),
('lgbt-pride',null),
('recreational',null),
('lunch-option',null),
('neck-fetish',null),
('queer-space',null),
('designated-quiet-spaces',null),
('scottish-bar',null),
('blended-family',null),
('stockings',null),
('tourist-attraction',null),
('uncut',null),
('community-event',null),
('gender-bending',null),
('nudist-meditation-retreat',null),
('suspension',null),
('lgbtq-activism',null);

create temp table _b9_close (id uuid primary key, resolution text) on commit drop;
insert into _b9_close
select distinct on (t.id) t.id, 'overlap resolved: the duplicate is merged into this tag'
  from _b9_canon c
  join public.unified_tags t on t.slug = c.slug and t.status = 'active'
 where exists (select 1 from public.unified_tags m
                where m.merged_into_id = t.id and m.status = 'merged'
                  and (c.dup is null or m.slug = c.dup))
on conflict do nothing;

insert into _b9_close
select t.id, 'kept separate: overlaps a related but distinct tag'
  from public.unified_tags t
 where t.status = 'active'
   and t.slug = any (array['queer-community','university','anal-lube','recreation','lgbtq-safe','shopping','women-focused','alternative-culture','australian-lgbtq','balloon','social-gathering','birth-certificates','male-spa','rooftop-bar','gay-rights-movement','male-sauna','plastic-surgery','sexual-rights','aids-support','parental-support','tokyo-nightlife','gay-events','social-group','tourist-destination','beach-area','kitten','airline-lounge','gay-party','gender-affirming-medical-interventions','inclusive-healthcare','mental-wellbeing','neuroqueer','parisian-restaurant','spanish-coast','throuple','asylum-rights','chinese-restaurant','community-event-space','cross-dresser','domination','eating-out','gender-performance','gender-affirming-therapy','kink-community','music-club','north-african-queer','peaceful-protest','piano','pubic-hair','resilience-factors','shibuya-bars','st-martin','transvestite','vampiress','ace-of-hearts-spades','ace-of-spades','acquired-immunodeficiency-syndrome-aids','anti-queer-discrimination','black-bisexual-lesbians','boot-slut','businessperson','chosen-relationships','clitoral-stimulator','consent-and-non-verbal-communication','corset-training','cultural-participation','daddy-domme','decorative-cutting','drag-scene-events','emotional-well-being','estradiol-various-formulations','estrogen-therapy','female-genitalia','feminizing-hormone-therapy','findom-me','freedom-of-assembly-and-association','gender-performance-theory','gender-affirming-counseling','genderqueer-visibility','hepatitis-a-b','hiv-prevention-treatment','homosexuality-in-modern-sports','hormone-blockers','inclusive-healthcare-for-lgbtqia-individuals-with-disabilities','inclusive-lgbtqia-and-disability-allyship','inclusive-sports-and-recreational-activities','leather-dog','leathermen-leatherwomen','lgbtq-lgbtqia-identity','lgbtqia-individuals-as-disability-advocates','master-mistress','nice-atmosphere','nonviolent-resistance','nudist-fashion','nudist-swimwear','performativity-and-identity-formation','peripartum-depression','pianist','polyurethane-clothing','postpartum-depression','pride-anthem','protest-movements','pubephilia','queer-asylum-seekers','queer-community-centers','queer-rights-movement','racial-microaggressions','resistance-and-subversion','right-to-cultural-artistic-and-scientific-life','right-to-health','right-to-participate-in-public-life','romance-love','shoes','stepfather-relationships','subversion','tasting-board','testicular-cancer-screening','testicular-sex','testicular-torture','urethral-fuck','venues-in-barcelona'])
on conflict do nothing;

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792825527')
  from _b9_close c
 where g.entity_id = c.id and g.entity_type = 'tag'
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
declare v_n int; v_bad int;
begin
  select count(*) into v_bad from _b9_pairs p join public.unified_tags s on s.id = p.src_id
   where s.status <> 'merged' or s.merged_into_id is distinct from p.tgt_id;
  if v_bad <> 0 then raise exception 'batch9: % merges did not land', v_bad; end if;
  select count(*) into v_bad from public.unified_tags m join public.unified_tags t on t.id = m.merged_into_id
   where m.status = 'merged' and t.status = 'merged';
  if v_bad <> 0 then raise exception 'batch9: % merged tags still point at a merged tag', v_bad; end if;
  select count(*) into v_n from _b9_close;
  if v_n < 100 then raise exception 'batch9: only % rows to close; the corpus has drifted', v_n; end if;
  select count(*) into v_bad from _b9_close c join public.tag_suggestions g
      on g.entity_id = c.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch9: % inbox rows are still pending', v_bad; end if;
end
$verify$;
