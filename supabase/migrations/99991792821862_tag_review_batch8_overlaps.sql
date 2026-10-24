
-- Excel review queue 2026-10-23, batch 8: the "overlaps only" rows, whose note named
-- an overlapping tag but no action. Each named partner was looked up on prod.
--
--   * 197 merges where the two tags are the same concept under another
--     spelling or form (gender-fluidity -> gender-fluid, corsets -> corsetry,
--     prostate-massage -> prostate-stimulation, structural-racism -> systemic-racism).
--     The less-used side goes into the more-used one. Do-not-merge exclusions are
--     filtered out (health-well-being -> health is one). Aliases and earlier merges are repointed, and chains collapsed.
--   * 5 "x-y-etc" catch-all headings with no usage are deprecated.
--   * Only the rows this batch acts on are closed in the inbox.
--
-- Left open on purpose: overlaps between related but distinct tags (queer-friendly vs
-- gay-friendly, sauna vs sauna-club, dance-club vs nightclub, women-only vs women-focused, kitten vs kitten-play, and similar), where
-- merging would lose a real distinction. antiretroviral stays: it is an e2e-asserted
-- canonical row.

select set_config('app.actor', 'migration:99991792821862_tag_review_batch8_overlaps', true);

select setval('public.tag_slug_redirects_id_seq',
              greatest((select coalesce(max(id), 1) from public.tag_slug_redirects),
                       (select last_value from public.tag_slug_redirects_id_seq)));

create temp table _b8_pairs on commit drop as
select r.src, r.tgt, s.id as src_id, t.id as tgt_id
from (values ('adult-oriented','adult'), ('anal-play','anal'), ('counseling-and-support','counseling'), ('therapy-counseling','therapy'), ('rainbow-flag-lgbt','pride-flag'), ('lgbtq-pride-flags','pride-flag'), ('denim-play','denim'), ('pride-march','pride-parade'), ('bdsm-restraints','bondage-gear'), ('lgbtq-intersectionality','intersectional'), ('major-depressive-disorder-mdd','depression'), ('comfortable-atmosphere','relaxed-atmosphere'), ('ducky','duck'), ('outdoor-venue','outdoor'), ('gender-fluidity','gender-fluid'), ('trans-rights-activism','trans-advocacy'), ('electroplay','electro'), ('electrode-punishments','electro'), ('breakfast-spot','breakfast-option'), ('history-of-homosexuality','queer-history'), ('family-services','family-support'), ('family-resources','family-support'), ('lgbtq-inclusion','lgbtq-inclusive'), ('queer-inclusive','lgbtq-inclusive'), ('queer-culture','lgbtq-culture'), ('hiv-aids-care','hiv-treatment'), ('media-culture-representation','representation-in-media'), ('japanese-culture','japanese'), ('cafe-coffee-and-tea-house','cafe'), ('gender-norms','gender-role'), ('lgbtq-advocate','advocate'), ('leather-scene','leather-community'), ('indian-restaurant','indian-cuisine'), ('aromanticism','aromantic'), ('members-club','private-club'), ('vinyl-clothing','vinyl'), ('pvc-clothing','pvc'), ('bondage-cuffs','cuffs'), ('film-director','director'), ('employment-discrimination-protections','employment-non-discrimination'), ('employment-equality','employment-non-discrimination'), ('lesbianism','lesbian'), ('naked','nudity'), ('social-hub','social-space'), ('community-oriented','community-focused'), ('legal-transition','legal-gender-recognition'), ('minority-stressors','minority-stress'), ('masculinizing-hormone-therapy','testosterone-therapy'), ('testosterone-various-formulations','testosterone'), ('aids-information-centers','aids-organizations'), ('bisexual-identity','bisexual'), ('boot-kink','boot'), ('sexual-activity','sexual-behavior'), ('structural-racism','systemic-racism'), ('institutional-racism','systemic-racism'), ('androgynous','androgyny'), ('queer-travel','lgbt-tourism'), ('lgbtq-travel-destinations','lgbt-tourism'), ('queer-counseling','lgbtq-therapy'), ('trauma-informed-space','trauma-informed'), ('active-bystander-training','bystander-intervention'), ('casual-eats','casual-dining'), ('culturally-sensitive','cultural-sensitivity'), ('feminine','femininity'), ('masculine','masculinity'), ('humiliation-play','humiliation'), ('lgbtqia-literature-and-arts','lgbtq-arts'), ('mental-health-wellbeing','mental-health'), ('robot-fetish','robot'), ('senior-focused','seniors'), ('sexual-reproductive-health','reproductive-health'), ('in-the-closet','closet'), ('drug-abuse','addiction'), ('emotional-connection','emotional-intimacy'), ('fetishism','fetish'), ('food-bar','bar-food'), ('queer-mental-health','lgbtq-mental-health'), ('legal-and-policy-reform','policy-reform'), ('right-to-privacy','privacy-rights'), ('sexually-fluid','sexual-fluidity'), ('activism-rights','activism'), ('adoptive-parenthood','adoptive-parent'), ('algophilia','algolagnia'), ('birth-control-methods','birth-control'), ('breast-augmentation-affirming','breast-augmentation'), ('breath-control-play','breath-play'), ('choking-play','choking'), ('chemsex-related-issues','chemsex'), ('comedown-care','comedown'), ('contraception-family-planning','contraceptive-methods'), ('corsets','corsetry'), ('critique-of-essentialism','anti-essentialism'), ('crucifixion-fetish','crucifixion-play'), ('cultivating-empathy','empathy'), ('empathy-training','empathy'), ('damsel','damsel-in-distress'), ('degradation','degradation-play'), ('dildo-harness','strap-on'), ('discriminatory-laws','anti-lgbtq-legislation'), ('dominant-women','female-dominance'), ('drink-specials','happy-hour'), ('drug-purity-testing','drug-checking'), ('drug-testing-kits','drug-checking'), ('dsd-disorders-of-sex-development','variations-of-sex-development-vsd'), ('economic-rights','economic-social-and-cultural-rights'), ('emotional-reaction','emotion'), ('feet','foot-fetish'), ('fish-hooks','flesh-hooks'), ('foot-fetish-play','foot-play'), ('frotting','frottage'), ('fun-events','events'), ('gay-men-s-flags','gay-men-pride-flag'), ('gender-as-a-discursive-practice','gender-performativity'), ('gender-assignment','assigned-sex'), ('gender-identity-recognition','legal-gender-recognition'), ('gender-recognition-laws','legal-gender-recognition'), ('gender-inclusivity','gender-inclusive'), ('gender-responsive-parenting','gender-conscious-parenting'), ('external-genitalia','genitals'), ('hair-services','hair-salon'), ('harm-reduction-interventions','harm-reduction'), ('risk-minimization','harm-reduction'), ('health-well-being','health'), ('herpes-simplex-virus-hsv','herpes'), ('homocore','queercore'), ('queer-punk','queercore'), ('inclusive-sex-education','comprehensive-sex-education'), ('interdependence-of-rights','indivisibility-of-rights'), ('intersectional-queer-activism','intersectional-activism'), ('intersex-legal-protections','intersex-rights'), ('jazzy-music','jazz-music'), ('kink-conventions','kink-events'), ('legal-procedures','legal-process'), ('lesbian-flags','lesbian-pride-flag'), ('lesbian-flags-symbols','lesbian-symbols'), ('lesbian-pride-rights','lesbian-rights'), ('lesbian-pride-rights-etc','lesbian-rights'), ('lesbian-sensibility-separatism','lesbian-separatism'), ('lgbt-slogans-symbols','lgbt-symbols'), ('lgbtq-community-spaces','lgbtq-spaces'), ('lgbtq-literature-and-media','lgbtq-literature'), ('lgbtq-meeting-places','lgbtq-venue'), ('lgbtqia-legal-aid-and-support','legal-aid'), ('lgbtqia-mental-health-support','mental-health-support'), ('queer-visibility-in-politics','lgbtqia-political-representation'), ('multigender','polygender'), ('noetisexual','sapiosexual'), ('outercourse','non-penetrative-sex'), ('nudist-body-painting','nudist-body-art'), ('nudist-colony','nudist-camp'), ('nudist-nature-walk','nudist-hiking-trail'), ('nudist-sports','nude-recreation'), ('opioid-agonist-therapy','medication-assisted-treatment-mat'), ('orgasm-play','orgasm-control'), ('safer-use-and-overdose-prevention-training','overdose-prevention-education'), ('political-potential-of-performativity','performativity-and-resistance'), ('play-spaces','play-room'), ('polyamorous','polyamory'), ('power-knowledge-regime','knowledge-power-nexus'), ('primal-prey','prey'), ('prostate-massage','prostate-stimulation'), ('protecting','protector'), ('queer-dance','lgbtq-dance'), ('queer-hip-hop-artists','queer-hip-hop'), ('queer-identity-formation','sexual-identity-development'), ('queer-inclusive-education','lgbtq-education'), ('queer-parenting-resources','family-support'), ('queer-representation','lgbtqia-representation-in-media'), ('queer-representation-in-media','lgbtqia-representation-in-media'), ('reproductive-anatomy','reproductive-system'), ('rock-bands','rock-music'), ('rope-play','rope-bondage'), ('rope-bondage-suspension','rope-bondage'), ('rubberism','rubber-fetish'), ('safer-use-in-nightlife-settings','rave-harm-reduction'), ('same-sex-parent-family','lgbtq-parenting'), ('scenario-play','sexual-roleplay'), ('sensual-play','sensory-play'), ('sensual-hedonist','sensualist'), ('sex-in-public','public-play'), ('sex-online','online-play'), ('sex-repulsed-asexual','sex-repulsed'), ('sexual-addiction','sexual-compulsivity'), ('social-justice-oriented','social-justice'), ('urethral-sounding','sounding'), ('sounding-rods-sound','sounding'), ('spanking-bench','spanking-horse'), ('spice','synthetic-cannabinoids'), ('stateless-persons-rights','statelessness'), ('sti-screening','sti-testing'), ('testicular-health-care','testicular-health-and-care'), ('testicular-self-examination','testicular-examination'), ('trans-inclusive-healthcare','gender-inclusive-healthcare'), ('transgender-health-services','trans-health'), ('vacuum-pumping','vacuum-pump'), ('webcam-porn','amateur-camming'), ('wet-and-messy-wam','splosh')) r(src, tgt)
join public.unified_tags s on s.slug = r.src and s.status = 'active'
join public.unified_tags t on t.slug = r.tgt and t.status = 'active'
where not exists (select 1 from public.tag_relationship_exclusions e
                  where e.tag1_id = least(s.id, t.id) and e.tag2_id = greatest(s.id, t.id));

create temp table _b8_done (src_id uuid, tgt_id uuid, src text, audit_id uuid) on commit drop;

do $merge$
declare r record; v_audit uuid;
begin
  for r in select * from _b8_pairs order by src loop
    begin
      update public.tag_category_assignments set is_primary = false where tag_id = r.src_id and is_primary;
      v_audit := public.merge_tag_concept(r.tgt_id, r.src_id, 'migration:99991792821862', 'excel-review-batch8-2026-10-23');
      execute 'delete from public.tag_aliases a using public.unified_tags c
       where a.canonical_tag_id = $1 and c.id = $2
         and lower(btrim(a.alias_name)) = lower(btrim(c.name))' using r.src_id, r.tgt_id;
      update public.tag_aliases set canonical_tag_id = r.tgt_id where canonical_tag_id = r.src_id;
      update public.unified_tags set merged_into_id = r.tgt_id
       where merged_into_id = r.src_id and status = 'merged' and id <> r.tgt_id;
      insert into _b8_done values (r.src_id, r.tgt_id, r.src, v_audit);
    exception when others then
      raise notice 'batch8 merge skipped % -> %: %', r.src, r.tgt, sqlerrm;
    end;
  end loop;
end
$merge$;

create temp table _b8_dep (slug text primary key) on commit drop;
insert into _b8_dep values
('lgbt-music-theatre-etc'),
('lgbtq-actors-etc'),
('lgbtq-books-cartoons-etc'),
('activism-advocacy-concepts'),
('bisexual-biographies-art-films-etc');

create temp table _b8_dep_ok on commit drop as
select t.id, t.slug from _b8_dep d join public.unified_tags t on t.slug = d.slug
where t.status = 'active' and t.usage_count = 0 and not t.human_reviewed;

update public.unified_tags t
   set status = 'deprecated', deprecated_at = now(), seo_indexable = false,
       deprecation_reason = 'Review queue 2026-10-23: catch-all heading with no usage'
  from _b8_dep_ok o where t.id = o.id;

create temp table _b8_close (id uuid primary key, resolution text) on commit drop;
insert into _b8_close
select d.src_id, 'merged into ' || (select slug from public.unified_tags where id = d.tgt_id) from _b8_done d
union select id, 'deprecated: catch-all heading, no usage' from _b8_dep_ok
;

update public.tag_suggestions g
   set status = 'rejected', reviewed_at = now(),
       metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
         'resolution', c.resolution, 'resolved_by', 'migration:99991792821862')
  from _b8_close c
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
  select count(*) into v_n from _b8_done;
  if v_n < 170 then raise exception 'batch8: only % of 197 merges landed; the corpus has drifted', v_n; end if;
  select count(*) into v_bad from _b8_pairs p join public.unified_tags s on s.id = p.src_id
   where s.status <> 'merged' or s.merged_into_id is distinct from p.tgt_id;
  if v_bad <> 0 then raise exception 'batch8: % merges did not land', v_bad; end if;
  select count(*) into v_bad from _b8_done d join public.tag_aliases a on a.canonical_tag_id = d.src_id;
  if v_bad <> 0 then raise exception 'batch8: % aliases still point at a merged source', v_bad; end if;
  select count(*) into v_bad from _b8_done d join public.unified_tags m on m.merged_into_id = d.src_id;
  if v_bad <> 0 then raise exception 'batch8: % older merges still point at a merged source', v_bad; end if;
  select count(*) into v_bad from public.unified_tags m join public.unified_tags t on t.id = m.merged_into_id
   where m.status = 'merged' and t.status = 'merged';
  if v_bad <> 0 then raise exception 'batch8: % merged tags still point at a merged tag', v_bad; end if;

  select count(*) into v_bad from _b8_dep_ok o join public.unified_tags t on t.id = o.id where t.status <> 'deprecated';
  if v_bad <> 0 then raise exception 'batch8: % rows were not deprecated', v_bad; end if;

  select count(*) into v_bad from _b8_close c join public.tag_suggestions g
      on g.entity_id = c.id and g.source = 'excel_review_2026_10_23'
   where g.status = 'pending';
  if v_bad <> 0 then raise exception 'batch8: % inbox rows are still pending', v_bad; end if;
end
$verify$;
