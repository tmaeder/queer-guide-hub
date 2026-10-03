-- `/tags/water-sports` is ONE ROW DOING TWO JOBS, and which job you see depends on
-- which surface you are.
--
-- Reported by a reader asking why water sports is related to surfing and swimming
-- rather than to piss play. The answer was on the row: `wikidata_id = Q61065`,
-- resolved live rather than inferred — label "water sport", description "sports that
-- take place in or on water", enwiki sitelink "Aquatic sports", P31 Q31629. Every
-- derived artifact took that side. The three ontology edges were never authored:
--
--     surfing      -> water-sports   (broader, auto)
--     swimming     -> water-sports   (broader, auto)
--     water-sports -> news-sports    (broader, auto)
--
-- plus six aliases that are all translations of the sports sense (Wassersport,
-- sport aquatique, sports nautiques, sports d'eau vive, deporte acuático,
-- sport nautique) and two `tag_sources` rows citing Q61065.
--
-- THE TWO HALVES WERE SERVED TO DIFFERENT AUDIENCES ON ONE URL. Measured on prod
-- with a Googlebot UA:
--
--   <meta description>  "The act of urinating or defecating on oneself or a partner,
--                        often for erotic purposes."
--   <article>           "Water sports, also known as aquatic sports, are activities
--                        conducted on waterbodies. They can be categorized based on
--                        the degree of immersion by the parti..."
--
-- That is the documented render-surface precedence doing maximum damage: the crawler
-- meta reads `description` first, the article reads `long_description` first. So
-- Google indexed a urination definition while a visitor read about kayaking, on an
-- `seo_indexable`, `publication_role='article'` page filed under Practices & Play.
--
-- IT IS NOT "WRONG PROSE ON A SPORTS ROW" NOR "A WRONG ENTITY ON A KINK ROW". The row
-- is literally half each, which is why no single-field repair fits it:
--
--   kink signals            sports signals
--   ------------            --------------
--   description             wikidata_id Q61065
--   is_adult = true         short_description, long_description
--   category Practices&Play 6 multilingual aliases
--                           3 ontology edges
--                           0 assignments — it files nothing
--
-- WHY THE EARLIER REPAIR MISSED IT, AND THE LESSON IS ABOUT POSTCONDITIONS.
-- `50100101100100` found this exact defect class, resolved Q61065 correctly, and
-- repaired **`watersports`** — no hyphen — naming that slug at all eight of its
-- references including both postconditions. One of those asserted the row no longer
-- carries Q61065. **It passed, truthfully, while the hyphenated sibling carried it
-- the whole time.** A postcondition scoped to a slug cannot see another slug holding
-- the same defect. The row it did repair was already `utility` and deindexed; the one
-- it missed was the live `article` page.
--
-- THE SPORTS SENSE IS MOVED, NOT DELETED, and that is the load-bearing choice. The
-- taxonomy is CORRECT: measured, `news-sports` carries 2,706 assignments, `swimming`
-- 7 and `surfing` 4, all three in the `utility` lane, and surfing and swimming
-- genuinely belong under a water-sports node. Deleting the edges to make room for the
-- kink sense would destroy a working sports taxonomy to fix a naming collision. So
-- Q61065, the six translations and the two sources go to a new `aquatic-sports`
-- utility row — the same re-parent-rather-than-delete move `20360401100300` made with
-- queer theory's eight translations. Nothing here is discarded except two wrong
-- claims.
--
-- `water-sports` then becomes the kink glossary page the name means on this platform.
-- Its identifier is NULLED, never repointed: `tag_medical_codes_sync` and
-- `tag_wikidata_hierarchy` rebuild weekly from that column, so a plausible-but-wrong
-- QID regenerates wrong data forever while a null one regenerates nothing. Measured
-- first: this row carries NO medical codes, so there is nothing to reap.
--
-- `description` IS REWRITTEN HERE, against this series' usual rule, because it is
-- itself wrong: "urinating **or defecating**" conflates water sports with scat. Those
-- are separate practices with different risks and `scat-play` is its own live row. On
-- a platform where these words are how people agree what is and is not on the table,
-- that is not a cosmetic error.
--
-- PROSE CLAIMS CHECKED AGAINST OUR OWN CORPUS BEFORE BEING WRITTEN. "Natursekt" is
-- already an approved-path alias on `urophilia`, so the German term is corroborated
-- rather than invented; `scat-play` is `status='active'`, so "that is scat" points at
-- a row that exists. The abbreviations "WS" and "NS" are DELIBERATELY NOT written —
-- neither appears anywhere in the corpus, and an unsourced piece of scene shorthand
-- is exactly what the nine-source piss-play pass refused fourteen times.
--
-- The new body is deliberately about THE WORD, so it does not restate its siblings:
-- `golden-shower` covers the act and where it lands, `urophilia` the clinical framing,
-- `piss-play` consent. That also keeps this off the one-summary-many-rows defect.
--
-- DELIBERATELY NOT DONE: `water-sports` now holds the same concept as `watersports`
-- (15 uses) and `piss-play` (12), so which row is canonical is a merge decision across
-- four existing rows and is left to a human. It is given NO `broader` edge rather than
-- a guessed one — an empty ontology band is honest, a wrong parent is not. Also named
-- and not touched: `Rosa 'Golden Showers'`, a ROSE CULTIVAR sitting as an alias on
-- `golden-shower` (`auto`, so inert for display and auto-tagging, but a namesake
-- artifact).
--
-- THE ORDER OF THE THREE STEPS IS LOAD-BEARING, and only the dry run could show it.
-- `enforce_tag_wikidata_identity()` RAISES 23505 on a second ACTIVE tag taking an
-- identifier another active tag already holds — "two active tags sharing an identifier
-- is the duplicate class, not a synonym". So the kink row must RELEASE Q61065 before
-- the sports row can take it. Written the intuitive way round (create the new home,
-- then clear the old row) the insert fails and the whole migration aborts, which on
-- `main` takes every migration queued behind it. Release first, rehome second, move
-- the artifacts third.
--
-- Guarded by src/lib/__tests__/waterSportsSenseSplit.test.ts.

do $$
declare
  v_kink     uuid;
  v_sports   uuid;
  v_sportcat uuid;
  v_moved    int;
begin
  -- Attribution. `water-sports` is human_reviewed, so log_unified_tag_change()
  -- RAISES for an undeclared system actor. Verified live on this row rather than
  -- assumed, and with a value that genuinely differs — a self-assignment changes no
  -- column and fires no trigger, which reads exactly like a permissive one.
  perform set_config('app.actor', 'migration:99991790527174_water_sports_sense_split', true);

  select id into v_kink from public.unified_tags where slug = 'water-sports';
  if v_kink is null then
    raise notice 'water-sports absent — nothing to split, leaving alone';
    return;
  end if;

  select id into v_sportcat from public.tag_categories where slug = 'sports-recreation';
  if v_sportcat is null then
    -- A typo in this file, which no later corpus state repairs. Hard.
    raise exception 'category sports-recreation not found';
  end if;

  ------------------------------------- 1. RELEASE the identifier and become the kink page
  -- MUST precede the insert below: enforce_tag_wikidata_identity() refuses a second
  -- active tag holding Q61065, so the sports row cannot be created while this one
  -- still carries it.
  --
  -- Content-guarded on the sports text, so a human who fixes this first keeps their
  -- work. Prior values survive in tag_change_log.before_data, which is why content
  -- writes go through an attributed actor.
  update public.unified_tags
     set wikidata_id   = null,
         wikipedia_url = null,
         short_description =
           'The common euphemism for sexual play involving urine.',
         description =
           'Sexual play involving urine — an umbrella euphemism rather than a specific act. '
           || 'It covers being urinated on, urinating on a partner, drinking, and watching.',
         long_description =
'Water sports is the euphemism most profiles, ads and party listings use for urine play. It is an umbrella term rather than a single act: it covers being urinated on, urinating on a partner, drinking, and watching. German-speaking scenes use Natursekt for the same thing.

It does not include faeces. That is scat, a separate practice with different risks, and older glossaries sometimes conflate the two — which matters when these are the words people are using to agree what is and is not on the table.'
   where id = v_kink
     and (wikidata_id = 'Q61065'
          or long_description ilike '%aquatic sports%'
          or description ilike '%defecating%');

  --------------------------------------------------------------- 2. the sports row
  -- Soft: another session may have created it already.
  select id into v_sports from public.unified_tags where slug = 'aquatic-sports';

  if v_sports is null then
    insert into public.unified_tags (
      name, slug, status, category, category_id,
      -- EXPLICIT, and not merely for tidiness. `publication_role` is NOT NULL with NO
      -- DEFAULT, and the three BEFORE triggers fire in name order:
      -- trg_unified_tags_wikidata_identity, then zy_validate_tag_entity_target, then
      -- zz_enforce_tag_publication_role. Omit it and the middle one sees NULL, where
      -- `new.publication_role <> 'entity_redirect'` evaluates to NULL rather than
      -- true — so it neither returns early nor recognises a redirect, and raises
      -- "An entity redirect requires a reviewed type, ID, and path" (23514) on a row
      -- that has nothing to do with redirects. A three-valued-logic trap with a
      -- thoroughly misleading message; you cannot INSERT here without this column.
      publication_role,
      short_description, description,
      wikidata_id, wikipedia_url,
      is_adult, is_sensitive, seo_indexable, human_reviewed
    ) values (
      'Aquatic Sports', 'aquatic-sports', 'active',
      'Sports & Recreation', v_sportcat,
      -- Filing vocabulary, like all three of its neighbours. zz_enforce_tag_publication_role
      -- would land it here regardless — a new row cannot be an article, since
      -- prose_reviewed_at and the ontology/localisation states all default unset — but
      -- stating it means the row is what it claims rather than what a gate left behind.
      'utility',
      'Sports played in or on water.',
      'Competitive and recreational sports that take place in or on water, including swimming, surfing, diving, rowing and sailing.',
      'Q61065',
      -- The entity's REAL enwiki sitelink. The old row cited List_of_water_sports,
      -- which is a list article, not the concept. Both resolve 200; this is the one
      -- wbgetentities returns.
      'https://en.wikipedia.org/wiki/Aquatic_sports',
      false, false,
      -- Explicit. A revive or insert that moves status but not this column is how
      -- eight terms once went live to crawlers with nothing to self-heal them.
      false,
      false
    )
    returning id into v_sports;

    -- Neither category trigger fires on INSERT, so all three representations are set
    -- by hand: the TEXT column above, category_id above, and the junction row here.
    -- `/tags/:slug` renders the JUNCTION while the search facet renders the TEXT.
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (v_sports, v_sportcat, true)
    on conflict do nothing;
  else
    raise notice 'aquatic-sports already exists — reusing it';
  end if;

  ------------------------------------------------- 3. move the sports artifacts over
  -- alias_slug is globally UNIQUE, so this is an UPDATE across rather than an
  -- insert+delete; an INSERT would fail and leaving both splits one phrase across
  -- two tags.
  update public.tag_aliases
     set canonical_tag_id = v_sports
   where canonical_tag_id = v_kink
     and alias_slug in ('wassersport','sport-aquatique','sport-nautique',
                        'sports-deau-vive','sports-nautiques','deporte-acutico');
  get diagnostics v_moved = row_count;
  raise notice 'aliases moved to aquatic-sports: %', v_moved;

  -- Both cite Q61065 / List_of_water_sports, so they are correct for the sports row
  -- and wrong only for this one. Moved rather than deleted for the same reason as the
  -- aliases.
  update public.tag_sources set tag_id = v_sports where tag_id = v_kink;

  -- Re-point the taxonomy. surfing and swimming each carry exactly ONE broader edge
  -- (measured), and aquatic-sports is new, so the unique key on
  -- (source, target, relation_type) cannot collide.
  update public.tag_relations
     set target_tag_id = v_sports
   where target_tag_id = v_kink and relation_type = 'broader';

  update public.tag_relations
     set source_tag_id = v_sports
   where source_tag_id = v_kink and relation_type = 'broader';
end $$;

do $verify$
declare
  v_bad int;
begin
  ---------------------------------------------------------------------------- P1
  -- The kink row no longer carries the sports entity, the sports prose, or the
  -- claim that water sports includes faeces.
  select count(*) into v_bad
    from public.unified_tags
   where slug = 'water-sports'
     and (wikidata_id is not null
          or wikipedia_url is not null
          or coalesce(long_description,'') ilike '%aquatic sports%'
          or coalesce(short_description,'') ilike '%sports on or in water%'
          or coalesce(description,'') ilike '%defecating%');
  if v_bad <> 0 then
    raise exception 'P1: water-sports still carries the aquatic-sports sense';
  end if;

  ---------------------------------------------------------------------------- P2
  -- It is still publishable. tag_has_prose is an OR, so CALL it rather than
  -- restating a stricter both-present form that would fail on a correct row.
  select count(*) into v_bad
    from public.unified_tags
   where slug = 'water-sports'
     and not public.tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'P2: water-sports is no longer publishable';
  end if;

  ---------------------------------------------------------------------------- P3
  -- The sports sense EXISTS somewhere. Nulling the identifier without rehoming it
  -- would be a deletion dressed as a split.
  select count(*) into v_bad
    from public.unified_tags
   where slug = 'aquatic-sports'
     and status = 'active'
     and wikidata_id = 'Q61065'
     and category = 'Sports & Recreation'
     and not seo_indexable
     and not is_adult;
  if v_bad <> 1 then
    raise exception 'P3: aquatic-sports is missing or malformed';
  end if;

  ---------------------------------------------------------------------------- P4
  -- All three category representations agree on the new row. Asserting only
  -- category_id passes on exactly the shape the missing INSERT triggers produce.
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
    join public.tag_category_assignments a
      on a.tag_id = t.id and a.category_id = c.id and a.is_primary
   where t.slug = 'aquatic-sports'
     and t.category = 'Sports & Recreation'
     and c.slug = 'sports-recreation';
  if v_bad <> 1 then
    raise exception 'P4: aquatic-sports category representations disagree';
  end if;

  ---------------------------------------------------------------------------- P5
  -- The taxonomy SURVIVED. This is the half a delete-the-edges repair would have
  -- destroyed: surfing and swimming still have a parent, and it is a sports one.
  select count(*) into v_bad
    from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where r.relation_type = 'broader'
     and t.slug = 'aquatic-sports'
     and s.slug in ('surfing','swimming');
  if v_bad <> 2 then
    raise exception 'P5: surfing/swimming lost their parent (% of 2)', v_bad;
  end if;

  select count(*) into v_bad
    from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where r.relation_type = 'broader'
     and s.slug = 'aquatic-sports' and t.slug = 'news-sports';
  if v_bad <> 1 then
    raise exception 'P6: aquatic-sports is not under news-sports';
  end if;

  ---------------------------------------------------------------------------- P7
  -- No sports edge still touches the kink row. That is what the reader saw.
  select count(*) into v_bad
    from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where s.slug = 'water-sports' or t.slug = 'water-sports';
  if v_bad <> 0 then
    raise exception 'P7: % relation(s) still hang off water-sports', v_bad;
  end if;

  ---------------------------------------------------------------------------- P8
  -- The six translations MOVED rather than being deleted, and none is still on the
  -- kink row. Counted both directions, because "none on the kink row" is equally
  -- satisfied by having dropped them.
  select count(*) into v_bad
    from public.tag_aliases a join public.unified_tags t on t.id = a.canonical_tag_id
   where t.slug = 'aquatic-sports'
     and a.alias_slug in ('wassersport','sport-aquatique','sport-nautique',
                          'sports-deau-vive','sports-nautiques','deporte-acutico');
  if v_bad <> 6 then
    raise exception 'P8: % of 6 sports aliases reached aquatic-sports', v_bad;
  end if;

  select count(*) into v_bad
    from public.tag_aliases a join public.unified_tags t on t.id = a.canonical_tag_id
   where t.slug = 'water-sports';
  if v_bad <> 0 then
    raise exception 'P9: % sports alias(es) still sit on water-sports', v_bad;
  end if;

  ---------------------------------------------------------------------------- P10
  -- CONTROLS. The rows this file must not have touched. Without these, a sweep that
  -- flattened the whole urine-play family would satisfy every assertion above.
  select count(*) into v_bad
    from public.unified_tags
   where (slug = 'watersports'   and coalesce(description,'') = '')
      or (slug = 'piss-play'     and coalesce(long_description,'') = '')
      or (slug = 'golden-shower' and coalesce(long_description,'') = '')
      or (slug = 'urophilia'     and wikidata_id is distinct from 'Q457251')
      or (slug = 'scat-play'     and status <> 'active')
      or (slug = 'news-sports'   and usage_count < 2000);
  if v_bad <> 0 then
    raise exception 'P10: % sibling row(s) were damaged', v_bad;
  end if;

  raise notice 'water-sports split OK: kink page on the slug, sports sense rehomed on aquatic-sports, taxonomy intact';
end
$verify$;
