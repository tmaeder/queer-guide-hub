-- Four corrections found by comparing the glossary against Berlin's own
-- harm-reduction and anti-violence material: sidekicks.berlin (a project of
-- Schwulenberatung Berlin — /en/sex/, /en/drugs/, /en/advice-services/ and the
-- Darkroom Cruising Vocabulary) and MANEO, the gay anti-violence project
-- (the K.O.-Tropfen handout, the pickpocket flyer, and the Gedaechtnisprotokoll
-- tips page).
--
-- The comparison was meant to find MISSING vocabulary. Most of what it found
-- instead was vocabulary we already hold, filed against the wrong thing.
--
-- 1. `darkroom` IS THE PHOTOGRAPHY SENSE, on 176 uses.
--
--    wikidata_id Q601413 — verified live, label "darkroom", description
--    "workshop used by photographers make prints and otherwise handle
--    photographic film" — with wikipedia_url pointing at en/Darkroom, and a
--    `description` that opens "A darkroom is used to process photographic film,
--    make prints and carry out other associated tasks." That is on a row filed
--    under Practices & Play, flagged is_adult, used 176 times.
--
--    This is the namesake chimera `_shared/tag-wiki-guard.ts` was written for
--    (`golden-shower` -> Cassia fistula), and the wrong-sense class of
--    20261012090500 (`vacuum-pump` -> Otto von Guericke's 1650 device) at the
--    same time: the article title agrees with the tag name exactly, and the
--    entity class — a room — is perfectly plausible. Both existing guards pass
--    it. It is the highest-usage wrong-sense row found so far.
--
--    seo_indexable is already false, so no crawler ever saw it; site visitors
--    and site search did. The identifier is NULLED rather than repointed, per
--    the rule 20261008100000 set: `tag_medical_codes_sync` and
--    `tag_wikidata_hierarchy` rebuild from this column weekly, so a
--    plausible-but-wrong QID regenerates wrong data forever while a null one
--    regenerates nothing. Prose is replaced, not merely retracted, because the
--    row is ACTIVE and rendering — a retraction would leave a 176-use page
--    blank, where this leaves it correct.
--
--    It stays UNPUBLISHED (seo_indexable=false, human_reviewed=false). The new
--    body is authored here and nobody else has read it; house convention is
--    that unreviewed prose does not go to crawlers.
--
-- 2. `stis-stds` PUBLISHES A SCRAPE TIMESTAMP AS ITS DEFINITION.
--
--    Its `description` reads, in full: "Updated May  4, 2023  9:52pmUpdated
--    May  4, 2023  9:52pm". The row is ACTIVE and seo_indexable=true, named
--    "Stis / Stds", usage 0, human_reviewed=false — a facet-clone duplicate of
--    `sti` (active, usage 95, correct prose, Q12198), the same shape as
--    `lavenderscare` and `genre-queer-theory`. Merged into `sti` rather than
--    deprecated, so "Stis / Stds" keeps routing somewhere and
--    `unmerge_tag_concept` can reverse it. Both rows already share one
--    category_id, so `merge_tag_concept` takes its delete branch and the
--    `tag_category_assignments_one_primary_per_tag` 23505 that 20361124161700
--    documents cannot fire; the migration asserts that premise rather than
--    trusting it.
--
--    The merged row keeps seo_indexable=true and its artifact description, and
--    that is inert rather than sloppy: measured on prod, 0 of 288 merged tags
--    and 0 of 5,271 deprecated tags are in `search_documents`, against 4,725 of
--    4,725 active ones, and `fetchTagWithCategories` resolves `status='active'`
--    so the page 404s. The merge is what removes it from both.
--
-- 3. `safer-injecting` CARRIES SEVEN ALIASES OF THE SAINT LOUIS ART MUSEUM.
--
--    "Saint Louis Art Museum", "Museo de Arte de San Luis", "collection du
--    musee d'art de Saint-Louis" and three more spellings of the same museum,
--    plus "moshing" — slam dancing. SLAM is the museum's acronym and "slam" is
--    the mosh pit, and both were harvested onto a harm-reduction tag whose real
--    aliases, "Slam" and "Slamming", sit in the same list. They are all
--    review_status='auto', so since 20261012090000 they neither display nor
--    drive auto-tagging: this is junk, not live harm, and it is deleted on that
--    basis rather than retracted with ceremony. The tag's own wikidata_id is
--    already NULL, so there is nothing to repoint — only the harvest survived.
--
-- 4. `spiking` HAS AN EMPTY BODY, and the material for it is in the MANEO
--    handout.
--
--    Filling an empty long_description is not the LLM rewrite this repo banned
--    in 20261018094000 — nothing is destroyed and the UPDATE is guarded on
--    emptiness. `spiking` is human_reviewed=true, so the write needs a declared
--    actor or `log_unified_tag_change()` raises; `app.actor` is set below.
--
--    The German "K.O.-Tropfen" is moved onto it from `ghb`, where it sat as an
--    inert `auto` alias. That is a correction, not a preference: the term names
--    the ACT of covert administration, not a substance. MANEO's own Berlin case
--    series — about 181 cases between 1995 and 2012 — records sedatives and
--    medicines as well as G, including a 2001 homicide by methadone overdose.
--    `alias_slug` is globally UNIQUE, so the row has to be moved rather than
--    inserted; leaving it on `ghb` and adding another would split one phrase
--    across two tags.
--
-- NOT DONE, each measured rather than assumed:
--
--   `bdo`      sidekicks titles its page "GHB / GBL / BDO" and the glossary has
--              no `bdo` row — but BDO is already an APPROVED `covers` alias of
--              `ghb`, and `ghb`'s own prose names GBL and BDO and explains the
--              conversion. Never a gap. Recorded so the next comparison does
--              not re-propose it.
--   `chill`    the chemsex sense (a private drug-and-sex party) is missing, and
--              the live `chill` row is an empty stub filed under Venue Types,
--              seo_deindex_reason='thin'. It cannot be fixed with an alias:
--              "Chill" is an existing tag NAME, so `tag_reject_alias_shadow()`
--              rejects it on `chemsex`. Left open rather than half-fixed.
--   pickpockets MANEO's Taschendiebe flyer is real safety advice but general
--              crime prevention, not queer vocabulary. Its one genuinely
--              darkroom-specific line — valuables belong at the bar, never in
--              the darkroom — is folded into `darkroom` below instead.
--   Gedaechtnis- there is no established English term for it, and minting one
--   protokoll  would be inventing vocabulary. Its substance — write it down
--              while memory is fresh, because a year can pass before a trial —
--              is folded into `spiking` below instead.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:berlin-harm-reduction-corrections', true);

do $mig$
declare
  v_sti      uuid;
  v_dup      uuid;
  v_darkroom uuid;
  v_spiking  uuid;
  v_ghb      uuid;
  v_n        int;
begin
  ---------------------------------------------------------------- 1. darkroom
  select id into v_darkroom from public.unified_tags where slug = 'darkroom';
  if v_darkroom is null then
    raise exception 'darkroom: row is gone — re-check by hand';
  end if;

  update public.unified_tags set
    wikidata_id   = null,
    wikipedia_url = null,
    short_description =
      'A dark room in a bar, club or sauna for sex — a social space as much as a sexual one, with a consent practice that is almost entirely wordless.',
    description =
      'A dark, largely unlit room in a bar, club, sauna or sex club where people have sex. It is a social space as much as a sexual one, and no two are alike: layout, lighting, noise level and furnishing are what signal which activities belong where. Consent is negotiated with little or no speech — through touch, eye contact and body language — so giving a clear refusal and taking one gracefully is the central skill rather than an afterthought.',
    long_description =
      'A darkroom is a dark, largely unlit room in a bar, club, sauna or sex club where people have sex. It is a sexual and a social space at once, and it usually has sections: the organisation of the space, the lighting, the noise level and the furnishing are what tell you which activities are likely to happen where. Every darkroom is different, and reading one is a skill in itself.

At first glance a darkroom can look as though no consent is being practised at all. What is actually happening is a dense exchange conducted with no words or very few: the question, and the yes, no or maybe, are carried by touch, eye contact and explicit body language. A caress is often how contact is opened, in place of a spoken request. These cues are faster, more assertive and more explicit than in most other settings, and something that would read as an abrupt boundary crossing in the light can be a direct invitation in the dark. The two abilities the space runs on are giving a kind but firm rejection, and receiving one without making it a problem.

It does not suit everyone, and that is not a failure of nerve. For some people a darkroom activates their own history with sexual trauma, with being touched, or with boundaries around strangers, and it is worth deciding in advance whether the experience is one you want. The same holds in the other direction: some people in the room prefer to be asked out loud, and whatever privacy is available.

Setting intentions before going in is common and useful. What am I looking for tonight, and do I know? Am I following the mood or after one specific thing? Will I use substances, which ones, and how much? How long do I want to be here? What are my hard and soft limits? Knowing the answers matters — and so does leaving room for them to change once you are in there.

Darkroom consent culture is inherited. It was shaped mainly by cis gay men and still is, though in Berlin queer nightlife these rooms are increasingly mixed, which means the people in them arrive from several different sex cultures and do not all share one set of signals. The practices themselves have been handed down through generations of sex-deviant subcultures, and they are open to being changed by the people using them now.

One practical note that has nothing to do with sex: valuables have no business in a darkroom. Many bars will hold a wallet at the counter or the coat check, and Berlin anti-violence casework is consistent that a dark, crowded room where everyone is touching everyone is the worst possible place to be carrying cards, cash or a phone.',
    seo_indexable  = false,
    human_reviewed = false
  where id = v_darkroom
    and description like 'A darkroom is used to process photographic film%';

  if not found then
    raise exception 'darkroom: row did not carry the photography description — re-check by hand before overwriting';
  end if;

  insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, is_public)
  values (v_darkroom, 'editorial:general-knowledge',
          'https://sidekicks.berlin/darkroom/',
          'Wrong-sense repair. The row carried wikidata_id Q601413 (the photographic darkroom), wikipedia_url en/Darkroom, and a description about processing film — on a Practices & Play tag used 176 times. Identifier nulled rather than repointed, per the rule that weekly syncs rebuild from it. Prose replaced (not retracted) because the row is active and rendering; grounded in the Darkroom Cruising Vocabulary published by sidekicks.berlin, with one line on valuables from MANEO''s pickpocket flyer. Left unpublished.',
          false);

  ---------------------------------------------------------------- 2. stis-stds
  select id into v_sti from public.unified_tags where slug = 'sti'       and status = 'active';
  select id into v_dup from public.unified_tags where slug = 'stis-stds' and status = 'active';

  if v_sti is null then
    raise exception 'stis-stds: canonical `sti` is not active — refusing to merge into it';
  end if;

  if v_dup is null then
    raise notice 'stis-stds: already resolved, nothing to merge';
  else
    -- 20361124161700: merge_tag_concept only DELETES the loser''s category row
    -- when the winner holds the same category_id; filed differently it moves the
    -- row and trips tag_category_assignments_one_primary_per_tag. Here they
    -- match, so assert it instead of pre-demoting something that needs no
    -- demotion.
    if (select category_id from public.unified_tags where id = v_sti)
       is distinct from
       (select category_id from public.unified_tags where id = v_dup) then
      raise exception 'stis-stds: the two rows no longer share a category — demote the loser''s primary junction first';
    end if;

    perform public.merge_tag_concept(
      v_sti, v_dup,
      'migration:berlin-harm-reduction-corrections',
      'Facet-clone duplicate of `sti`. Its description was the scrape artifact "Updated May  4, 2023  9:52pmUpdated May  4, 2023  9:52pm", published on an active seo_indexable row with zero usage, while `sti` carries correct prose, Q12198 and 95 uses.');
  end if;

  ------------------------------------------------------- 3. safer-injecting aliases
  delete from public.tag_aliases a
   using public.unified_tags t
   where a.canonical_tag_id = t.id
     and t.slug = 'safer-injecting'
     and a.alias_slug in ('collection-du-muse-dart-de-saint-louis',
                          'muse-dart-de-saint-louis',
                          'musee-dart-de-saint-louis',
                          'museo-de-arte-de-saint-louis',
                          'museo-de-arte-de-san-luis',
                          'museo-de-arte-de-st-louis',
                          'saint-louis-art-museum',
                          'moshing');
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise notice 'safer-injecting: no museum aliases found — already cleaned';
  end if;

  -- The real ones must survive: deleting these would break the routing that
  -- made `slamming` reachable after 20260809 merged it here.
  if not exists (select 1 from public.tag_aliases a join public.unified_tags t on t.id = a.canonical_tag_id
                  where t.slug = 'safer-injecting' and a.alias_slug = 'slamming') then
    raise exception 'safer-injecting: the `slamming` alias was removed — that is not this migration''s doing';
  end if;

  ---------------------------------------------------------------- 4. spiking
  select id into v_spiking from public.unified_tags where slug = 'spiking' and status = 'active';
  select id into v_ghb     from public.unified_tags where slug = 'ghb';
  if v_spiking is null then
    raise exception 'spiking: no active row — re-check by hand';
  end if;

  update public.unified_tags set
    long_description =
      'Spiking is putting a drug into someone without their knowledge, so that they can be robbed, assaulted or both. The German term for it, K.O.-Tropfen, names the act rather than a substance, and that is the accurate way to think about it: MANEO, the gay anti-violence project in Berlin, recorded roughly 181 cases in the city between 1995 and 2012, and the substances involved ranged across sedatives, prescription medicines and G. One 2001 case was a homicide by methadone overdose. In 2012 alone there were nine recorded cases, three of them killings.

Most reported cases start in a bar or a club, where the person who administers the drug has met the target the same evening. What bystanders can see is fairly specific: someone who becomes heavily and suddenly impaired, out of proportion to what they have drunk, who is being steered by one or two people they met that night, and whose new companions are insistent about taking charge of them. If you see that, ask the impaired person their name and whether they want a taxi. Ask the companions their names too, and fix faces and clothing in your memory.

Afterwards it rarely looks like a crime from the inside. People come round feeling ill rather than hung over, lose the whole evening as a blank, and often only work out the next day that money has gone from their account or that things are missing from their flat. Because of that, the questions to ask someone describing a blank evening are concrete: has anything been withdrawn from your account, and is anything missing from home?

Evidence is the part with a deadline. Traces of these substances are detectable only briefly, so the advice is to get to a doctor or a hospital immediately and have urine and blood samples taken — on suspicion, before anything is proven, because the window closes either way. Report it to the police. If it happened in your own flat, do not clean it before the police have secured traces. If a card is missing, block it.

Write down what happened as soon as you can, in as much detail as you can manage, in the order it happened. Memories fade, and what you experienced blends with what you are told afterwards; a year or more can pass between a report and a trial. A written record made the same day is a support for your own memory, and is just as worth making if you have decided not to go to the police yet — it keeps the option open.

The countermeasures are mundane by design, because this is an assault in progress rather than a risk to be managed: your own cup, marked; your own lube; your own bottle.'
  where id = v_spiking
    and coalesce(long_description, '') = '';

  if not found then
    raise exception 'spiking: long_description was not empty — this migration fills, it never overwrites';
  end if;

  -- Move the German term off `ghb`. alias_slug is globally UNIQUE, so this is an
  -- UPDATE: an INSERT of the same slug would fail, and leaving the old row in
  -- place would split one phrase across two tags.
  update public.tag_aliases set
    canonical_tag_id = v_spiking,
    alias_name       = 'K.O.-Tropfen',
    alias_type       = 'multilingual',
    review_status    = 'approved'
  where alias_slug = 'k-o-tropfen'
    and canonical_tag_id = v_ghb;

  insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
  values (v_spiking, 'KO-Tropfen',     'ko-tropfen',     'multilingual', 'approved'),
         (v_spiking, 'Knockout drops', 'knockout-drops', 'synonym',      'approved')
  on conflict (alias_slug) do nothing;

  insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, is_public)
  values (v_spiking, 'editorial:general-knowledge',
          'https://maneo.de/wp-content/uploads/2023/06/KO-Tropfen-Handout-130207-2-2.pdf',
          'Empty long_description filled from MANEO''s K.O.-Tropfen handout: the Berlin case series 1995-2012, the bystander signs, the short detection window for urine and blood samples, and the recommendation to write a record while memory is fresh. German aliases moved here from `ghb` — K.O.-Tropfen names the covert administration, not one substance.',
          false);
end $mig$;

-- Postconditions. Each re-asserts the state this file exists to reach, not the
-- phrasing of a condition inside it.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from public.unified_tags
   where slug = 'darkroom'
     and (wikidata_id is not null
          or wikipedia_url is not null
          or coalesce(description, '') like '%photographic%'
          or coalesce(long_description, '') = ''
          or seo_indexable);
  if v_bad > 0 then
    raise exception 'verify: darkroom is still wrong-sense, empty, or published';
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug = 'stis-stds' and status = 'active';
  if v_bad > 0 then
    raise exception 'verify: stis-stds is still an active duplicate';
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug = 'sti' and status <> 'active';
  if v_bad > 0 then
    raise exception 'verify: the merge took the wrong side — `sti` is no longer active';
  end if;

  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where t.slug = 'safer-injecting'
     and (a.alias_slug like '%saint-louis%' or a.alias_slug like '%san-luis%'
          or a.alias_slug like '%st-louis%' or a.alias_slug = 'moshing');
  if v_bad > 0 then
    raise exception 'verify: % museum alias(es) still on safer-injecting', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags
   where slug = 'spiking' and coalesce(long_description, '') = '';
  if v_bad > 0 then
    raise exception 'verify: spiking still has no body';
  end if;

  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where a.alias_slug in ('ko-tropfen', 'k-o-tropfen')
     and t.slug <> 'spiking';
  if v_bad > 0 then
    raise exception 'verify: a K.O.-Tropfen alias still points somewhere other than spiking';
  end if;
end $verify$;
