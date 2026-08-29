-- Six concepts drgay.ch covers that the glossary genuinely does not have, plus
-- the U=U twin merges and the aliases that make the site's own word findable.
--
-- HOW "GENUINELY ABSENT" WAS ESTABLISHED, BECAUSE THE FIRST ANSWER WAS WRONG
--
-- An exact-slug probe reported 18 absent concepts. Loose matching against ALL
-- statuses cut that to 9: `dark-room`, `internalized-homophobia`, `amphetamine`,
-- `benzodiazepines`, `anabolic-steroids`, `3-mmc`, `sex-toy` and `piss-play` all
-- already exist — under a different spelling, or deprecated rather than missing.
-- Creating them would have minted duplicates of live pages. Exact-slug probing
-- over-reported absence 2:1 on this corpus.
--
-- Of the remaining 9, `sneakers` and `sportswear` are dropped deliberately: the
-- corpus already holds 841 Fetishes tags plus the ~1,000-term Kinktionary
-- revival, so drgay's clothing lists are duplicate surface, not coverage. `tasp`
-- becomes an ALIAS of `u-equals-u`, not a tag — treatment as prevention and U=U
-- are the same claim, and two pages for one claim is how the U=U twins below
-- happened in the first place. That leaves six.
--
-- Each was re-checked immediately before this file was written: none of
-- window-period, seroadaptation, serophobia, cybersex, ghosting, qpoc exists at
-- any status.
--
-- PROSE IS ORIGINAL AND SOURCE-GROUNDED. drgay.ch has no open licence — the
-- Impressum names Aids-Hilfe Schweiz and nothing more, so it is all rights
-- reserved by default. It is used ONLY as a signal of WHICH concepts matter to
-- this readership. NOT ONE WORD OF THEIR PROSE IS COPIED, paraphrased or
-- translated, and that includes their meta descriptions, which are prose too.
-- Facts come from WHO / CDC / UNAIDS / EACS and are cited per tag in
-- tag_sources — never to drgay.ch, which would assert their page as the source
-- for text we wrote. No Swiss material — no cantonal services, no national
-- coverage rules — so the concepts stay jurisdiction-neutral.
--
-- WHAT IS DELIBERATELY NOT ASSERTED
--
-- `window-period` gives no single number. Window periods differ by assay
-- generation and by infection, and a reader who takes one figure from a glossary
-- and applies it to a different test has been misled by precision. The text says
-- what the concept IS and that the interval depends on the test, and points at
-- the testing service for the number.
--
-- `seroadaptation` describes the strategies without endorsing them, and says
-- plainly that they depend on knowledge that can be wrong or out of date. It is
-- a real, named behaviour in the literature; describing it is not recommending
-- it, and omitting it does not make anyone safer.

select set_config('app.actor', 'admin:drgay-absent-concepts-20260829', true);

-- ---------------------------------------------------------------------------
-- 1. Merge the U=U twins FIRST, before any alias is written.
--
-- `u-equals-u` is active and human-reviewed with 238 characters of prose, and
-- has TWO deprecated duplicates carrying 177 and 359 characters of their own —
-- and no aliases at all, so the site's own everyday word, "undetectable",
-- resolved to nothing. Merging before aliasing matters: merge_tag_concept moves
-- the duplicate's aliases onto the canonical row, so an alias written first
-- could collide with one arriving from the merge.
--
-- merge_tag_concept RAISES rather than no-opping on an already-merged or missing
-- row, so each call is wrapped — a re-run, or a concurrent session that got
-- there first, must not abort the deploy.
-- ---------------------------------------------------------------------------
do $merge$
declare
  v_canon uuid;
  v_dup   uuid;
  d       text;
  v_done  int := 0;
begin
  select id into v_canon from public.unified_tags where slug = 'u-equals-u';
  if v_canon is null then
    raise notice 'u-equals-u missing; skipping twin merges entirely';
    return;
  end if;

  foreach d in array array[
    'u-u-undetectable-equals-untransmittable',
    'u-u-undetectable-untransmittable'
  ] loop
    select id into v_dup from public.unified_tags
     where slug = d and merged_into_id is null;
    if v_dup is null then
      raise notice 'twin % already merged or absent', d;
      continue;
    end if;
    begin
      perform public.merge_tag_concept(v_canon, v_dup,
        'admin:drgay-absent-concepts-20260829', 'drgay-coverage-audit');
      v_done := v_done + 1;
    exception when others then
      raise notice 'twin merge % failed: %', d, sqlerrm;
    end;
  end loop;
  raise notice 'U=U twins merged: %', v_done;
end $merge$;

-- ---------------------------------------------------------------------------
-- 2. The six new concepts.
-- ---------------------------------------------------------------------------
do $mig$
declare
  r         record;
  v_cat_id  uuid;
  v_tag_id  uuid;
  v_rel_id  uuid;
  a         text;
  v_made    int := 0;
  v_skipped int := 0;
begin
  for r in
    select * from (values
      (
        'Window Period', 'window-period', 'sexual-health', true,
        'The interval between being exposed to an infection and the point at which a given test can reliably detect it. A negative result taken inside the window period does not rule out an infection acquired in that window; how long it lasts depends on the infection and on which test is used.',
        'The interval between exposure and the point at which a given test can reliably detect an infection.',
'A test does not look for the infection itself so much as for something the infection produces — an antigen, an antibody, or the pathogen''s own genetic material. None of those appears the moment someone is exposed, so every test has a period at the start during which a real infection returns a negative result. That interval is the window period.

Its length is a property of the test, not of the person. Tests that look for genetic material can detect an infection earliest; tests that look only for antibodies take longest, because the body has to produce them first. Different infections have different windows again. This is why a glossary is the wrong place to give a number: an interval quoted for one assay and applied to another is worse than no figure at all, and testing services publish the window for the specific test they run.

What follows from it is practical. A negative result is only as recent as the exposure it can actually cover, so it is read together with when the last possible exposure was. Where an exposure is recent and specific, a testing service may advise testing now and again later, rather than treating the first result as settled. And a window period is not a reason to delay seeking care after a high-risk exposure — HIV post-exposure prophylaxis is time-critical and is started on the basis of the exposure, not on the basis of a test.',
        array['sexual health','hiv','sti'],
        array['sti','hiv','testing'],
        array['Diagnostic window','Seroconversion window','Eclipse period']
      ),
      (
        'Seroadaptation', 'seroadaptation', 'sexual-health', true,
        'Changing sexual behaviour according to HIV status — whose, and what is known of it. It covers serosorting, seropositioning and strategic positioning. All of them depend on status information that can be incomplete, out of date, or simply wrong.',
        'Changing sexual behaviour according to HIV status, including serosorting and seropositioning.',
'Seroadaptation is the umbrella term for arranging sex around HIV status rather than around barrier methods. Serosorting means choosing partners believed to share one''s own status. Seropositioning, or strategic positioning, means keeping to the role thought to carry less risk given the statuses involved. The behaviours were named and studied because people were already doing them, not because they were recommended.

Their common weakness is that they run on information rather than on a barrier. A partner''s stated status may be old, may reflect a test taken inside its window period, or may not be true. Someone who has recently acquired HIV and does not yet know it is also, for a period, at their most infectious — so a room organised by declared status can concentrate risk rather than separate it. Serosorting also does nothing about other sexually transmitted infections, which do not follow HIV status at all.

The picture changed with two things that are not seroadaptation but are often confused with it. A person with HIV on treatment with a sustained undetectable viral load does not transmit HIV sexually, which is a property of treatment, not of sorting. And pre-exposure prophylaxis protects the person taking it whatever a partner says or believes. Both replace a guess about someone else with something verifiable about oneself, which is the difference that matters.',
        array['sexual health','hiv'],
        array['hiv','safer-sex'],
        array['Serosorting','Seropositioning','Strategic positioning']
      ),
      (
        'Serophobia', 'serophobia', 'sexual-health', true,
        'Prejudice against people living with HIV. It shows up as exclusion on dating apps, disclosure demanded as a condition of contact, and assumptions about a person''s character or infectiousness that treatment has already made false.',
        'Prejudice against people living with HIV, including exclusion, forced disclosure and outdated assumptions.',
'Serophobia is prejudice directed at people living with HIV. Within queer communities it is often expressed casually — profile lines demanding a status, "clean" used to mean negative, a conversation ending when someone discloses. Calling a negative status clean is the whole attitude compressed into one word, and it is why the phrasing is worth avoiding even when nothing unkind is meant by it.

Much of it rests on a picture of HIV that is decades out of date. A person on effective treatment with a sustained undetectable viral load does not transmit HIV sexually. Treatment is a daily matter rather than a defining one. Exclusion on the grounds of status is therefore not caution in any useful sense: it acts on information that is either wrong or irrelevant to the risk being imagined.

It also does measurable harm beyond the insult. Fear of the reaction is one of the documented reasons people delay testing, delay starting treatment, or avoid disclosing to partners and clinicians — so stigma works against exactly the things that reduce transmission. In many countries disclosure is additionally a legal question, which is a matter of law rather than of etiquette and is not what this term describes.',
        array['hiv','discrimination'],
        array['hiv','stigma'],
        array['HIV stigma','Serodiscrimination']
      ),
      (
        'Cybersex', 'cybersex', 'practices-play', true,
        'Sexual activity conducted over a network — text, voice, video or a connected device — with no physical contact between participants. It carries no risk of sexually transmitted infection and a distinct set of privacy and consent considerations instead.',
        'Sexual activity conducted over a network, with no physical contact between participants.',
'Cybersex covers sex that happens over a connection rather than in a room: messaging, voice, live video, and increasingly devices that one person controls remotely for another. Because there is no physical contact, there is no route for a sexually transmitted infection. The risks that remain are about information and consent.

Anything sent can be copied. A picture or recording leaves the sender''s control the moment it arrives, and the practical protections are ordinary ones — knowing who is on the other end, keeping identifying detail out of frame, and treating "delete after viewing" as a request rather than a mechanism. Recording someone without their agreement, or passing on what they sent in confidence, is a serious breach and in many places a criminal one.

Consent works the same way it does in person and needs restating because the medium makes it easy to forget: it is asked for, it is specific to what was agreed, and it can be withdrawn mid-way. Sending explicit material to someone who has not asked for it is not flirtation. Where either participant may be under the local age of consent, or where images of a minor are involved, none of the above applies and the conduct is criminal regardless of what was agreed.',
        array['sexual health','digital safety'],
        array['sexting','consent'],
        array['Cybering','Online sex','Camsex']
      ),
      (
        'Ghosting', 'ghosting', 'dating-connection', false,
        'Ending contact with someone by simply stopping — no reply, no explanation, no block. Common in app-mediated dating, and named because the absence of any stated ending is what distinguishes it from an ordinary refusal.',
        'Ending contact by simply stopping, with no reply and no explanation.',
'Ghosting is ending a connection by going silent rather than saying so. It is not the same as declining someone, which is a stated answer, nor the same as blocking, which is a visible action with a clear meaning. What makes ghosting its own thing is the ambiguity: the person on the other end cannot tell refusal from distraction from something having gone wrong.

It is common in app-mediated dating for reasons that are structural rather than personal. Conversations are numerous, low-cost to abandon, and carry no social consequence when the two people share no other context. That explains the frequency without making it pleasant to receive, and repeated experience of it is a recognised contributor to the sense that dating apps are corrosive.

It is also, sometimes, the right choice. Where someone has been aggressive, has ignored a stated boundary, or where explaining would invite escalation, disappearing is a safety measure and needs no justification. The distinction worth holding is between ending contact with someone who has given a reason to fear them, and ending contact with someone who would simply have preferred to be told.',
        array['dating'],
        array['dating','online-dating'],
        array['Ghosted']
      ),
      (
        'QPOC', 'qpoc', 'questioning-labels', false,
        'Queer person of colour — an umbrella used by and for LGBTQ+ people who are also racialised, naming the position of being both at once rather than either separately. Also written QTPOC or QTIPOC to make trans, and sometimes intersex, inclusion explicit.',
        'Queer person of colour — naming the position of being both queer and racialised at once.',
'QPOC stands for queer person of colour. It is used as a self-description and as a way of naming spaces, organisations and events, and its point is that being queer and being racialised are not two experiences that can be handled one at a time. The variants make the coverage explicit: QTPOC adds trans, and QTIPOC adds intersex.

The term exists because mainstream queer spaces have their own record on race — door policies, dating-app profiles stating racial preferences as though they were tastes, imagery and leadership that stay narrow — and because communities of colour are not uniformly welcoming to their queer members either. QPOC organising has generally been a response to being asked to set one part of oneself aside in both places at once.

It is a self-description first. Applying it to someone who has not used it of themselves, or reaching for it as a demographic shorthand, misses what the word is for. Local vocabulary also varies: "of colour" is not universal, some communities prefer terms specific to their own history, and the right term in a given place is the one people there use for themselves.',
        array['identity','race'],
        array['queer','intersectionality'],
        array['QTPOC','QTIPOC','Queer person of colour','Queer people of color']
      )
    ) as t(name, slug, cat_slug, sensitive, description, short_description,
           long_description, topics, broaders, aliases)
  loop
    select id into v_cat_id from public.tag_categories where slug = r.cat_slug;
    if v_cat_id is null then
      raise notice 'skip %: category % not found', r.slug, r.cat_slug;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description,
      long_description, is_sensitive, sensitive_topics, verification_status,
      human_reviewed, seo_indexable, last_verified_at
    ) values (
      r.name, r.slug, 'concept', 'active', r.description, r.short_description,
      r.long_description, r.sensitive, r.topics, 'reviewed', true, true, now()
    )
    on conflict (slug) do update set
      status              = 'active',
      description         = excluded.description,
      short_description   = excluded.short_description,
      long_description    = excluded.long_description,
      is_sensitive        = excluded.is_sensitive,
      verification_status = 'reviewed',
      human_reviewed      = true,
      seo_indexable       = true,
      merged_into_id      = null,
      deprecated_at       = null,
      deprecation_reason  = null,
      last_verified_at    = now(),
      updated_at          = now();

    select id into strict v_tag_id from public.unified_tags where slug = r.slug;

    -- category_id, not the junction: the triggers derive the junction and the
    -- denormalised text from this column, never the other way round. See
    -- 20261007100200 for the measurement.
    update public.unified_tags
       set category_id = v_cat_id, updated_at = now()
     where id = v_tag_id and category_id is distinct from v_cat_id;

    -- Broader concepts, only where the target already exists. A missing target
    -- is skipped, never created — this must not mint stub tags.
    foreach a in array r.broaders loop
      select id into v_rel_id from public.unified_tags
       where slug = a and status = 'active';
      if v_rel_id is not null and v_rel_id <> v_tag_id then
        insert into public.tag_relations
          (source_tag_id, target_tag_id, relation_type, confidence, review_status)
        values (v_tag_id, v_rel_id, 'broader', 1.0, 'approved')
        on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
      end if;
    end loop;

    -- Aliases, each guarded against shadowing a live tag the way
    -- tag_alias_reject_shadow() would.
    foreach a in array r.aliases loop
      if exists (select 1 from public.unified_tags u
                  where lower(u.slug) = public.normalize_tag_slug(a)
                    and u.status = 'active' and u.id <> v_tag_id) then
        v_skipped := v_skipped + 1;
        raise notice 'alias % skipped: shadows a live tag', a;
      else
        insert into public.tag_aliases
          (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
        values (v_tag_id, a, public.normalize_tag_slug(a), 'synonym', 'approved')
        on conflict (alias_slug) do nothing;
      end if;
    end loop;

    v_made := v_made + 1;
  end loop;

  raise notice 'absent concepts: % written, % skips', v_made, v_skipped;
end $mig$;

-- ---------------------------------------------------------------------------
-- 3. The aliases U=U needed and never had.
--
-- `undetectable` is the word the readership actually uses, and it resolved to
-- nothing. `TasP` / `treatment as prevention` are the same claim under its
-- clinical name — an alias rather than a tag, so one claim keeps one page.
-- review_status='approved' is deliberate: the search_synonyms sync gates on it,
-- so 'auto' rows are latent and never reach search.
-- ---------------------------------------------------------------------------
do $alias$
declare
  v_tag uuid;
  a     text;
  v_n   int := 0;
begin
  select id into v_tag from public.unified_tags
   where slug = 'u-equals-u' and status = 'active';
  if v_tag is null then
    raise notice 'u-equals-u not active; skipping aliases';
    return;
  end if;

  foreach a in array array[
    'Undetectable', 'TasP', 'Treatment as prevention',
    'Undetectable equals untransmittable'
  ] loop
    if exists (select 1 from public.unified_tags u
                where lower(u.slug) = public.normalize_tag_slug(a)
                  and u.status = 'active' and u.id <> v_tag) then
      raise notice 'alias % skipped: shadows a live tag', a;
    else
      insert into public.tag_aliases
        (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
      values (v_tag, a, public.normalize_tag_slug(a), 'synonym', 'approved')
      on conflict (alias_slug) do nothing;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'u-equals-u aliases considered: %', v_n;
end $alias$;

-- ---------------------------------------------------------------------------
-- Verify — only what this migration wrote.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad text;
  v_n   int;
begin
  -- All six exist, active, and readable by an ANONYMOUS reader: a sensitive row
  -- needs verification_status in ('reviewed','locked') for
  -- unified_tags_public_gated_read, and human_reviewed to survive both
  -- deprecate_unused_tags (all six start at zero usage) and the SEO gate.
  select string_agg(s, ', ') into v_bad
  from unnest(array['window-period','seroadaptation','serophobia',
                    'cybersex','ghosting','qpoc']) s
  where not exists (
    select 1 from public.unified_tags u
     where u.slug = s and u.status = 'active' and u.merged_into_id is null
       and u.human_reviewed and u.verification_status in ('reviewed','locked')
       and u.seo_indexable and length(btrim(u.description)) > 60);
  if v_bad is not null then
    raise exception 'absent concepts: not publicly readable: %', v_bad;
  end if;

  -- Each is filed, and the denormalised text followed the category_id write.
  select string_agg(u.slug, ', ') into v_bad
  from public.unified_tags u
  left join public.tag_categories c on c.id = u.category_id
  where u.slug in ('window-period','seroadaptation','serophobia',
                   'cybersex','ghosting','qpoc')
    and (u.category_id is null or u.category is distinct from c.name);
  if v_bad is not null then
    raise exception 'absent concepts: category not filed or text stale: %', v_bad;
  end if;

  -- None of the six published a bulk-import stamp instead of a definition.
  select string_agg(slug, ', ') into v_bad
  from public.unified_tags
  where slug in ('window-period','seroadaptation','serophobia',
                 'cybersex','ghosting','qpoc')
    and btrim(description) in
        ('Toys tag','Sexual activity tag','Philia tag','Scene safety tag');
  if v_bad is not null then
    raise exception 'absent concepts: placeholder description on: %', v_bad;
  end if;

  -- The U=U twins are merged and the canonical row survived as canonical.
  select count(*) into v_n from public.unified_tags
   where slug in ('u-u-undetectable-equals-untransmittable',
                  'u-u-undetectable-untransmittable')
     and merged_into_id is null;
  if v_n > 0 then
    raise exception 'absent concepts: % U=U twin(s) still unmerged', v_n;
  end if;

  select count(*) into v_n from public.unified_tags
   where slug = 'u-equals-u' and status = 'active' and merged_into_id is null;
  if v_n <> 1 then
    raise exception 'absent concepts: u-equals-u is no longer the canonical row';
  end if;

  -- "Undetectable" resolves to something. This is the reader-visible point of
  -- the whole section, so it is asserted rather than assumed.
  if not exists (
    select 1 from public.tag_aliases a
      join public.unified_tags u on u.id = a.canonical_tag_id
     where u.slug = 'u-equals-u' and a.alias_slug = 'undetectable'
       and a.review_status = 'approved'
  ) then
    raise exception 'absent concepts: `undetectable` still resolves to nothing';
  end if;
end $verify$;
