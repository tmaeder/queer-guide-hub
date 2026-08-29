-- LGBTQA+ suicide prevention, part 5 of 5: say where this came from, and
-- publish the corrections that are the point of saying it.
--
-- Source and rationale: see the header of 20261007120000.
--
-- TWO THINGS, AND THEY ARE NOT THE SAME THING.
--
--   1. PROVENANCE (`tag_sources`). Parts 1-4 rewrote the prose on 40-odd
--      glossary rows against one document. Nothing in the schema recorded
--      that. `tag_sources` is where a tag's evidence lives, and the rows are
--      written `source_type='editorial'`, `is_public=false` — which is not
--      timidity, it is the constraint: `tag_sources_public_requires_citation`
--      admits a public row only for a statute, treaty, case, constitution or
--      resolution, because the public surface for that table is
--      `TagLegalSource`, the "Source of law" rail card. A clinical consensus
--      guideline is not law and must not render there. It is an internal
--      record of where the words came from, and it is what a later reader
--      follows when they want to check a sentence.
--
--   2. THE CORRECTIONS (`tag_myth_facts`). These DO render, at
--      /tags/:slug#myths via `TagMythFacts`, and this is where the guideline
--      earns its place on the site. A definition tells a reader what a word
--      means. What actually changes behaviour is the sentence that contradicts
--      something they already believe — that asking about suicide plants the
--      idea, that self-harm is attention-seeking, that telling the parents is
--      obviously the right first move. Every row below is a belief that is
--      both common and, acted on, harmful.
--
-- WHY THE MYTH BAND AND NOT MORE PROSE. The band is self-selecting: presence
-- of rows is the whole signal, there is no "is this a myth tag" flag. It
-- carries a mandatory kind label (a myth printed without its ✗ reads as
-- advice) and a visible attribution line. That makes it the only surface on a
-- tag page where a contested claim can be published with its correction
-- attached and its source named, which is exactly the shape this material
-- needs.
--
-- ATTRIBUTION IS A LIVE LINK AND WAS CHECKED, not recalled. `source_url` is
-- rendered as an anchor by TagMythFacts, so a dead one is a visible defect.
-- The institute's landing page for the guidelines 404s (verified 2026-08-29,
-- including after its own redirect); the PDF answers 200 application/pdf and
-- is what is linked. If a later reader finds it dead, the citation text stands
-- on its own — that is why `source` names the authors and year rather than
-- saying "the guidelines".
--
-- NOT ONE SENTENCE IS COPIED. The claims are the folk beliefs, phrased as
-- people actually say them; the corrections are ours, written from what the
-- document recommends. Same discipline as the Darklands rows in
-- 20260816105828 and the Substanzhandbuch rows in 20261003110300.
--
-- IDEMPOTENCY. Neither table has a natural key, so both blocks delete their
-- own rows by source before inserting — the pattern 20261003110300 established.
-- Scoped by `source` / `source_id`, so this can never touch another file's
-- rows.

set local statement_timeout = '600s';

select set_config('app.actor', 'admin:lgbtqa-prevention-5-20260829', true);

do $mig$
declare
  r        record;
  v_tag_id uuid;
  v_src    constant text := 'Strauss et al. (2022), LGBTQA+ suicide prevention guidelines';
  v_url    constant text := 'https://www.thekids.org.au/globalassets/media/documents/projects/lgbtqa-guidelines/lgbtqa-suicide-prevention-guidelines.pdf';
  v_key    constant text := 'lgbtqa-prevention-2022';
begin
  ---------------------------------------------------------------------------
  -- 1. Provenance for every row parts 1-4 wrote against the guideline.
  ---------------------------------------------------------------------------
  delete from public.tag_sources where source_id = v_key;

  for r in
    select * from (values
      -- part 1: repaired
      ('suicide-prevention',             'prose rewritten to safe-messaging standard; prevention framed as changing conditions'),
      -- part 2: revived
      ('suicidal-ideation',              'screening for risk factors; ideation distinguished from self-harm'),
      ('minority-stress',                'the model the guideline uses to locate cause outside the person'),
      ('stigma',                         'named as the driver of elevated risk'),
      ('mental-health-stigma',           'named as a barrier to help-seeking'),
      ('protective-factors',             'screening for protective factors, given equal weight to risk'),
      ('resilience',                     'protective factors section'),
      ('queer-resilience',               'connection to LGBTQ+ community as a protective factor'),
      ('family-acceptance',              'family acceptance and support; consent and safety qualifiers'),
      ('chosen-family',                  'support from chosen family, as defined by the young person'),
      ('crisis-intervention',            'response section: collaboration, continuity, LGBTQ+-specific helplines'),
      ('peer-support',                   'response section: expanding peer networks'),
      ('anxiety',                        'screening for risk factors'),
      ('post-traumatic-stress-disorder', 'screening for risk factors'),
      ('stress',                         'screening for risk factors'),
      ('gender-dysphoria',               'screening for risk factors'),
      ('internalized-transphobia',       'asked about directly, as part of feelings about one''s own identity'),
      ('anti-bullying-policies',         'risk factor: bullying including social exclusion'),
      ('chosen-name',                    'gender affirmation; deadnaming defined against it'),
      ('pronouns',                       'gender affirmation in practice'),
      ('social-transition',              'trans considerations: social, medical and legal affirmation'),
      ('gender-affirmation',             'experiences of affirmation listed among protective factors'),
      ('questioning',                    'glossary'),
      ('demisexual',                     'glossary'),
      ('intersectionality',              'the impact of intersecting identities'),
      -- part 3: created
      ('suicide',                        'the subject of the guideline; prose written to its safe-messaging standard'),
      ('exposure-to-suicide',            'risk factor: exposure to suicide of a relative, friend or peer'),
      ('safety-planning',                'response section: safety plans for any level of indicated risk'),
      ('help-seeking',                   'response section: ask about previous experiences of help-seeking'),
      ('social-isolation',               'risk factor'),
      ('bullying',                       'risk factor: bullying including social exclusion'),
      ('housing-instability',            'risk factor: housing instability due to LGBTQA+ identity'),
      ('vicarious-trauma',               'risk factor: witnessing abuse or violence'),
      ('body-image',                     'risk factor: issues related to body image'),
      ('intergenerational-trauma',       'Aboriginal and Torres Strait Islander considerations'),
      ('neurodivergent',                 'glossary'),
      ('brotherboy',                     'culturally appropriate language, as guided by the young person'),
      ('sistergirl',                     'culturally appropriate language, as guided by the young person'),
      ('gender-neutral-bathroom',        'risk factor: access to gender-appropriate bathrooms')
    ) as v(slug, claim)
  loop
    select id into v_tag_id from public.unified_tags
     where slug = r.slug and status = 'active';
    continue when v_tag_id is null;

    insert into public.tag_sources
      (tag_id, source_type, source_url, source_id, claim_summary, fetched_at, verified_at, is_public)
    values (v_tag_id, 'editorial', v_url, v_key, v_src || ' — ' || r.claim, now(), now(), false);
  end loop;

  ---------------------------------------------------------------------------
  -- 2. The corrections. Every claim is a belief people hold; every truth is
  --    what the guideline recommends instead.
  --
  --    `kind` says what the CLAIM is, not what the truth is: a `myth` row's
  --    claim is the false belief, a `fact` row's claim is a true statement
  --    people doubt.
  ---------------------------------------------------------------------------
  delete from public.tag_myth_facts where source = v_src;

  for r in
    select * from (values

    -- ── suicide ───────────────────────────────────────────────────────────
    ('suicide', 'myth', 0,
     'Asking someone directly whether they are thinking about suicide can put the idea in their head.',
     'It does not. Best-practice guidance asks providers to screen directly, and to do it periodically rather than once — a person who is already thinking about it is usually relieved to be asked, and someone who is not does not start because of a question.'),
    ('suicide', 'myth', 1,
     'LGBTQ+ people are at higher risk of suicide because they are LGBTQ+.',
     'The elevated rate tracks stigma, rejection, discrimination and violence — the conditions around people, not who they are. This is not a nuance: it is the finding that makes prevention possible, because conditions can be changed.'),
    ('suicide', 'myth', 2,
     'Someone who talks about it openly is not really at risk.',
     'A disclosure is information, and it is treated as such — taken seriously, asked about in specifics, and followed up. Guidance is explicit that a person should be told it is safe to raise, precisely because the fear of an overreaction is what keeps people quiet.'),
    ('suicide', 'fact', 3,
     'Most LGBTQ+ people are not suicidal, and assuming otherwise does harm.',
     'The same guidance that documents the raised risk warns against treating every queer person as fragile or unwell. Pathologising someone because of their identity is one of the harms being prevented, not a cautious version of preventing it.'),

    -- ── suicidal ideation ────────────────────────────────────────────────
    ('suicidal-ideation', 'myth', 0,
     'Suicidal thoughts and self-harm are the same thing.',
     'They are distinct and frequently occur apart. People who self-harm often have no intention of dying; people with serious ideation may never have harmed themselves. A response that infers one from the other misreads both.'),
    ('suicidal-ideation', 'myth', 1,
     'Any thought of suicide is an emergency.',
     'Ideation runs from a vague wish not to be here through to a specific plan, and those ends carry very different risk. Assessment asks about the specifics — which is why it is a conversation rather than an alarm.'),

    -- ── self-harm ────────────────────────────────────────────────────────
    ('self-harm', 'myth', 0,
     'Self-harm is attention-seeking.',
     'It is usually concealed, and most often functions as a way of managing unbearable feeling. Treating it as a performance is both wrong and a reliable way to end the conversation that might have helped.'),
    ('self-harm', 'myth', 1,
     'Someone who self-harms is attempting suicide.',
     'Often not — the intent is frequently to cope rather than to die. It is still a serious signal and still asked about directly, but the two need separate questions, because assuming either answer gets it wrong.'),

    -- ── suicide prevention ───────────────────────────────────────────────
    ('suicide-prevention', 'myth', 0,
     'Once someone is at real risk, the right move is to hand them to a specialist.',
     'Continuity is preferred where it is possible at all. Being passed elsewhere at the point of greatest need can read as one more abandonment — so guidance asks providers not to end the relationship because the risk went up, and to refer alongside rather than instead.'),
    ('suicide-prevention', 'myth', 1,
     'Telling the parents is obviously the right first step.',
     'For a queer young person the available adults are not automatically safe ones. Guidance asks providers to assess whether it is safe to inform a caregiver before doing it, and to decide who is told collaboratively with the person rather than on their behalf.'),
    ('suicide-prevention', 'fact', 2,
     'A service that is willing to work with LGBTQ+ people is not the same as one that is competent to.',
     'Guidance asks for demonstrated competence — staff who use the right name without being asked, forms that can hold it, and referrals to services already known to be affirming. Goodwill that has to be educated in the middle of a crisis costs the person seeking help.'),

    -- ── protective factors ───────────────────────────────────────────────
    ('protective-factors', 'myth', 0,
     'Risk assessment means cataloguing what is wrong.',
     'Guidance gives protective factors equal attention: a reliable caregiver relationship, chosen family, an affirming school or workplace, self-acceptance, role models, connection to community. They are screened periodically because they change — and unlike most risk factors, they can be built.'),

    -- ── family acceptance ────────────────────────────────────────────────
    ('family-acceptance', 'myth', 0,
     'Involving the family is always helpful.',
     'It is one of the strongest protective factors there is, and it is still conditional: with the person''s consent, in collaboration with them, and after the safety of informing the family has been assessed. The qualifier is the part that keeps it safe.'),
    ('family-acceptance', 'fact', 1,
     'Family acceptance is a set of behaviours, not a feeling.',
     'Using the name and pronouns, defending the person to relatives, letting them have queer friends, not treating the disclosure as a problem. That is what the evidence attaches to — which also makes it something a family can start doing before they have finished understanding.'),

    -- ── gender affirmation ───────────────────────────────────────────────
    ('gender-affirmation', 'myth', 0,
     'Using someone''s chosen name and pronouns is a courtesy.',
     'Guidance treats it as a basic condition of an affirming service, down to whether record systems can hold the name at all. Experiences of being affirmed in one''s gender are listed among the protective factors in suicide risk assessment.'),

    -- ── crisis intervention ──────────────────────────────────────────────
    ('crisis-intervention', 'myth', 0,
     'A generic crisis protocol covers everyone.',
     'The standard steps miss things that matter here: who is safe to tell, whether family dynamics are the problem rather than the support, and whether the helpline being offered is one that will get the person''s gender right. LGBTQ+-specific options are offered alongside general ones, not instead of them.')

    ) as v(slug, kind, sort, claim, truth)
  loop
    select id into v_tag_id from public.unified_tags
     where slug = r.slug and status = 'active';
    if v_tag_id is null then
      raise notice 'prevention-5: % not active, myth row skipped', r.slug;
      continue;
    end if;

    insert into public.tag_myth_facts (tag_id, kind, claim, truth, sort, source, source_url)
    values (v_tag_id, r.kind, r.claim, r.truth, r.sort, v_src, v_url);
  end loop;
end
$mig$;

do $verify$
declare
  v_n   int;
  v_src constant text := 'Strauss et al. (2022), LGBTQA+ suicide prevention guidelines';
begin
  ---------------------------------------------------------------------------
  -- Provenance landed for the whole family, and landed non-public. A public
  -- row here would render this guideline in the "Source of law" card.
  ---------------------------------------------------------------------------
  select count(*) into v_n from public.tag_sources
   where source_id = 'lgbtqa-prevention-2022';
  if v_n < 39 then
    raise exception 'prevention-5: expected provenance for 39 tags, found %', v_n;
  end if;

  select count(*) into v_n from public.tag_sources
   where source_id = 'lgbtqa-prevention-2022'
     and (is_public or source_type <> 'editorial');
  if v_n <> 0 then
    raise exception 'prevention-5: % provenance row(s) would render as a legal citation', v_n;
  end if;

  ---------------------------------------------------------------------------
  -- The corrections render. Asserted through the RPC the page actually calls,
  -- not the table — get_tag_myth_facts drops rows whose tag is inactive, or
  -- sensitive without being reviewed, and every tag here is BOTH sensitive
  -- (part 4) and reviewed. Reading the table would pass while the page stayed
  -- empty, which is the failure worth catching.
  ---------------------------------------------------------------------------
  select count(*) into v_n from public.tag_myth_facts where source = v_src;
  if v_n <> 16 then
    raise exception 'prevention-5: expected 16 myth/fact rows, found %', v_n;
  end if;

  for v_n in
    select 1 from public.unified_tags t
     where t.slug in ('suicide','suicidal-ideation','self-harm','suicide-prevention',
                      'protective-factors','family-acceptance','gender-affirmation',
                      'crisis-intervention')
       and not exists (
         select 1 from public.get_tag_myth_facts(t.id) f where f.source = v_src)
  loop
    raise exception 'prevention-5: a routed tag returns no myth rows through get_tag_myth_facts';
  end loop;

  -- Every row carries the attribution the band renders as a link. Both columns
  -- are NOT NULL in the table, so this is checking for empty strings.
  select count(*) into v_n from public.tag_myth_facts
   where source = v_src
     and (btrim(claim) = '' or btrim(truth) = '' or btrim(source) = ''
          or source_url !~ '^https://');
  if v_n <> 0 then
    raise exception 'prevention-5: % myth row(s) have an empty field or no https source', v_n;
  end if;

  -- Both kinds are present. A band of nothing but corrections reads as a
  -- lecture; the `fact` rows are what state the positive claims.
  select count(distinct kind) into v_n from public.tag_myth_facts where source = v_src;
  if v_n <> 2 then
    raise exception 'prevention-5: expected both myth and fact rows, found % kind(s)', v_n;
  end if;

  ---------------------------------------------------------------------------
  -- SAFE MESSAGING applies to these strings exactly as it does to the prose in
  -- part 3 — this band renders on the same page, above the fold on mobile.
  -- Same deny-list, same word boundaries, same reason (`\y` or `hang` matches
  -- inside "changed").
  ---------------------------------------------------------------------------
  select count(*) into v_n from public.tag_myth_facts
   where source = v_src
     and (claim || ' ' || truth) ~* '\y(hang|hangs|hanged|hanging|hung|noose|ligature|firearm|firearms|gunshot|poison|poisons|poisoned|poisoning|wrist|wrists|overdose|overdoses|overdosed|overdosing)\y';
  if v_n <> 0 then
    raise exception 'prevention-5: % myth row(s) name a method or means', v_n;
  end if;

  select count(*) into v_n from public.tag_myth_facts
   where source = v_src
     and regexp_replace(claim || ' ' || truth, '"[^"]*"', '', 'g')
           ~* '(committed suicide|successful (suicide|attempt)|failed (suicide|attempt))';
  if v_n <> 0 then
    raise exception 'prevention-5: % myth row(s) use committed/successful/failed framing', v_n;
  end if;

  -- The row that carries the whole point of the band must still say it. If a
  -- later edit softens this one, the page has a myths section that omits the
  -- myth the guideline exists to correct.
  select count(*) into v_n from public.tag_myth_facts
   where source = v_src and kind = 'myth'
     and claim ~* 'put the idea in their head';
  if v_n <> 1 then
    raise exception 'prevention-5: the asking-plants-the-idea correction is missing';
  end if;
end
$verify$;
