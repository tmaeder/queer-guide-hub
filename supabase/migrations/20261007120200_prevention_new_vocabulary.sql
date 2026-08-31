-- LGBTQA+ suicide prevention, part 3 of 5: the concepts that never existed here.
--
-- Source and rationale: see the header of 20261007120000. Parts 1 and 2 fixed
-- and revived rows that were already present in some state. These fourteen have
-- no row at all, in any status.
--
-- Guideline anchors, one per tag, so the warrant is checkable:
--   Part II "SCREENING FOR RISK FACTORS" — "Social isolation"; "Bullying
--     including social exclusion"; "Housing instability due to LGBTQA+
--     identity"; "Issues related to body image"; "Vicarious trauma (e.g., from
--     witnessing abuse or violence)"; "Exposure to suicide (e.g., a relative,
--     friend, or peer)"
--   Part II response section — "safety plans should ... be created with young
--     people who indicate any level of suicidal risk"; "ask about the young
--     person's previous experiences of help-seeking"
--   Part I risk factors — "access to gender-appropriate bathrooms"
--   Part III — "the impact of intergenerational trauma"; "Use culturally
--     appropriate language when discussing LGBTQA+ identities (e.g., Sistergirl,
--     Brotherboy), as guided by the young person"
--   Glossary — Neurodivergent
--   And `suicide` itself, which the glossary did not have: the slug space was
--   occupied by two empty German scraper hashtags (`suizid`, merged below, and
--   `lavenderscare-suizid`, deprecated in part 1).
--
-- SAFE MESSAGING IS A HARD CONSTRAINT ON THE `suicide` PROSE, not a style
-- preference, and the verify block at the foot of this file enforces it. The
-- text names no method, no means and no location; it does not present suicide
-- as a solution, as a release, or as an understandable response to hardship;
-- it does not give rates without the context that they are driven by treatable
-- conditions; and it ends by routing a reader in danger to /help. It also
-- states the language rule ("died by suicide", not "committed"), which is
-- ordinary glossary content and matters more than usual on this platform,
-- since "committed" is a residue of the era when the act was a crime — the
-- same body of law that criminalised the readership.
--
-- WIKIDATA IDS ARE DELIBERATELY ABSENT except for `suicide` (Q10737, verified
-- against Special:EntityData before use). Every other QID here was either
-- unknown or unverifiable at write time, and a wrong identifier is worse than
-- a missing one: it is the exact defect 2924fec6e had to repair across ten
-- tags, and it silently poisons run_tag_medical_codes_sync, which reads these
-- QIDs weekly and would attach another concept's clinical codes. Checking is
-- what caught it here too — the QID recalled for `bullying` turned out to be
-- the London School of Economics. Leave them null; fill them from a verified
-- resolver pass, never from memory.
--
-- MECHANICS: as parts 1 and 2. One row per statement (SQLSTATE 27000),
-- category_id alongside the junction row, merge BEFORE aliases, and
-- merge_tag_concept overwrites app.actor so it is re-set after.
--
-- CATEGORY TARGETS ARE TAXONOMY v3 STOPS, re-checked on rebase against the
-- tree 20261006140000/140100 installed while this work sat unmerged. One
-- changed: `neurodivergent` was filed to `identity-expression`, a v2 root that
-- PR E deletes. It goes to `questioning-labels` (Umbrella Terms & Labels, under
-- Identity), which is what the word literally is — an umbrella covering autism,
-- ADHD, dyslexia and more. It is deliberately NOT filed under Mental Health:
-- neurodivergence is not a mental illness, and filing it there would repeat
-- exactly the category error part 1 corrects for `homophobia`.
--
-- is_sensitive is NOT set here. Part 4 is the single writer of the sensitivity
-- policy for the whole family, so that the decision about which pages route a
-- reader to /help is made in one file and can be read in one place.

select set_config('app.actor', 'admin:lgbtqa-prevention-3-20260829', true);

do $mig$
declare
  r          record;
  v_tag_id   uuid;
  v_cat_id   uuid;
  v_rel_id   uuid;
  v_canon_id uuid;
  v_dup_id   uuid;
  a          text;
begin
  create temp table _new (
    slug text primary key, name text, cat text, qid text, descr text, shortd text, longd text
  ) on commit drop;

  insert into _new (slug, name, cat, qid, descr, shortd, longd) values

  ('suicide', 'Suicide', 'mental-health', 'Q10737',
   'Death caused by a deliberate act of self-harm. LGBTQ+ people, and queer young people in particular, are at higher risk than the general population — because of stigma, rejection and discrimination, not because of who they are. Most people who have thought about it do not die, and the conditions that raise the risk can be changed.',
   'Death caused by a deliberate act of self-harm. Raised risk among LGBTQ+ people tracks stigma and rejection, not identity.',
   'Suicide is death caused by a deliberate act of self-harm. It is a glossary entry here because the terms around it — ideation, self-harm, risk and protective factors, safety planning — are used across this site and are frequently used loosely.

The evidence for LGBTQ+ populations is consistent and it points away from identity as a cause. Queer young people are at significantly higher risk than their cisgender and heterosexual peers, and the explanation is stigma, rejection and discrimination, together with health services that are often not equipped for them. Best-practice guidance is explicit on both halves of this: the risk is real, and most LGBTQ+ people are not at risk at all. Treating someone as fragile because they are queer is itself one of the harms the guidance warns against.

What follows from that is practical. The things that raise risk are largely circumstances — a caregiver relationship strained over someone''s identity, bullying, losing housing, isolation, conversion practices, blocked access to gender affirmation. The things that lower it are also circumstances: an affirming school, chosen family, connection to community, being able to see people like you living well. Both are assessable, and both can change.

Two points about language. Say "died by suicide" rather than "committed suicide" — committing is what one does with a crime, and on this subject that is not a neutral inheritance. And avoid describing an attempt as successful or failed, which measures a death as an achievement.

If you are thinking about suicide right now, you can talk to someone today: the support page lists crisis lines by country.'),

  ('exposure-to-suicide', 'Exposure to Suicide', 'mental-health', null,
   'Having been affected by another person''s suicide — a relative, a friend, a peer, or someone in a community you belong to. It is named as a risk factor in its own right, and the connection does not have to have been close for it to count.',
   'Having been affected by another person''s suicide — a risk factor in its own right.',
   'Exposure to suicide means having lost someone to suicide or been close to it happening. Suicide risk assessment asks about it directly, listing a relative, a friend or a peer, because it raises risk independently of everything else in a person''s life.

It matters particularly for LGBTQ+ people for a structural reason: when a community carries elevated rates, more of its members have been exposed, and exposure can arrive through a community tie rather than a personal friendship. Grief of this kind is often disenfranchised — hard to explain to people who did not know the person or do not understand the connection — which is part of what makes support difficult to find.

It is also why safe-messaging conventions exist. How a death is described publicly measurably affects other people who have been exposed to it.'),

  ('safety-planning', 'Safety Planning', 'mental-health', null,
   'Working out in advance, with the person and not for them, what they will do when things get bad: their own warning signs, what helps, who to contact, and how to make their surroundings safer. Guidance says to make one with anyone showing any level of suicidal risk.',
   'Agreeing in advance what someone will do when things get bad — made with them, not for them.',
   'A safety plan is a short, concrete, written agreement made while someone is not in crisis, about what they will do when they are. It usually covers their own early warning signs, things that have helped before, people they can contact, and steps to make their immediate surroundings safer.

Two features are what make it work. It is specific — names, numbers, actions rather than intentions. And it is made collaboratively: guidance for LGBTQ+ young people states that safety plans should be created with anyone indicating any level of suicidal risk, and created in a way that is respectful and collaborative, because a plan written on someone''s behalf is a document they have no reason to use.

For queer people one part needs particular care. A plan usually names people to contact, and for an LGBTQ+ person the adults nearest to hand are not automatically safe ones. Working out in advance who those people actually are — which may be chosen family rather than family — is the difference between a plan that helps and one that puts someone at further risk.'),

  ('help-seeking', 'Help-Seeking', 'mental-health', null,
   'Reaching out for support, and everything that makes that harder — cost, distance, stigma, and for LGBTQ+ people the reasonable expectation of having to explain or defend yourself first. Past experiences of it predict whether someone tries again.',
   'Reaching out for support, and what stands in the way of it.',
   'Help-seeking is the step before any support works, and it is the step most often not taken.

The barriers are practical and psychological at once: what it costs, how far it is, whether anyone will find out, and whether it will help. LGBTQ+ people carry an additional and well-founded one — the expectation of having to educate a provider, correct assumptions, or be treated as a curiosity before the actual problem is reached. Where conversion practices exist, the expectation can be of active harm.

That is why best-practice guidance treats a person''s history of help-seeking as assessment material rather than background. It asks what they liked about previous services, what they did not, and specifically what made them decide not to go back. The last question is the useful one: it names a fixable thing, and it is rarely asked.'),

  ('social-isolation', 'Social Isolation', 'mental-health', null,
   'Having few or no social connections. Distinct from loneliness, which is how isolation feels — a person can be isolated without distress, or lonely in a crowd. Suicide risk assessment for LGBTQ+ young people asks separately about isolation from other LGBTQ+ people.',
   'Having few or no social connections — distinct from loneliness, which is how it feels.',
   'Social isolation is the objective state of having few connections; loneliness is the subjective experience of lacking them. They often occur together and are not the same thing, and the distinction is worth keeping because they call for different responses — one for contact, one for the quality of it.

Suicide risk assessment for LGBTQ+ young people lists both general isolation and, separately, "social isolation from other LGBTQA+ young people", and also asks about social rejection from other LGBTQ+ people. That second pair is easy to miss: being cut off from your own community, or pushed out of it, is a distinct harm from being cut off from everyone, and having queer friends does not by itself rule it out.'),

  ('bullying', 'Bullying', 'physical-digital-safety', null,
   'Repeated deliberate harm by someone with more power — physical, verbal, social or online. Named as a suicide risk factor for LGBTQ+ young people in three separate forms: bullying generally, bullying that includes social exclusion, and bullying that caused physical injury.',
   'Repeated deliberate harm by someone with more power, including exclusion and online forms.',
   'Bullying is repeated, deliberate harm where there is an imbalance of power. It covers physical harm, verbal abuse, exclusion, and the online forms, which differ mainly in being continuous and having an audience.

Suicide risk assessment for LGBTQ+ young people asks about it in more than one way — bullying including social exclusion, and separately bullying that resulted in physical injury — alongside verbal harassment and difficulties in educational settings, which for queer and trans students includes staff refusing to use a chosen name or pronouns and being denied appropriate bathrooms. Those are institutional conditions rather than peer behaviour, and they are assessed together because a young person experiences them together.

Not to be confused with the tag `bully`, which on this site is a body and role archetype and has nothing to do with this.'),

  ('housing-instability', 'Housing Instability', 'support-services', null,
   'Having no secure place to live, or being at risk of losing one — including sofa-surfing and repeated moves, not only rough sleeping. Assessment names the specific case of housing lost because of someone''s LGBTQ+ identity.',
   'Having no secure place to live, or being at risk of losing one.',
   'Housing instability spans more than homelessness as usually pictured: staying with friends, moving repeatedly, living somewhere unaffordable or unsafe, and being unable to plan more than a few weeks ahead.

For LGBTQ+ young people it has a particular cause, and suicide risk assessment names it precisely — "housing instability due to LGBTQA+ identity" — because being thrown out, or leaving to escape a household that has become unsafe, is a common route into it. Queer and trans young people are heavily over-represented in youth homelessness for that reason.

It compounds quickly: without an address, access to healthcare, benefits, school and work all get harder, which is why it appears in a suicide risk assessment rather than only in a housing one.'),

  ('vicarious-trauma', 'Vicarious Trauma', 'mental-health', null,
   'Being affected by exposure to what happened to someone else — witnessing abuse or violence, or repeatedly hearing accounts of it. It is listed as a risk factor for the person exposed, not only for the person harmed.',
   'Being affected by exposure to what happened to someone else.',
   'Vicarious trauma is the effect of exposure to another person''s trauma: witnessing violence, or hearing about it in detail and repeatedly. Suicide risk assessment lists it explicitly, with witnessing abuse or violence as the example.

For LGBTQ+ people it has a community dimension that a narrow reading misses. Following the aftermath of a hate crime, or a stream of hostile coverage about your own group, is exposure of this kind. So is the position of people who support others through it — peer supporters, moderators, helpline volunteers, and those who become the person everyone in their circle comes out to.'),

  ('body-image', 'Body Image', 'mental-health', null,
   'How a person perceives and feels about their own body. Named as a suicide risk factor for LGBTQ+ young people, where it is shaped both by appearance ideals within queer communities and, for trans people, by gender dysphoria.',
   'How a person perceives and feels about their own body.',
   'Body image is the relationship between how someone''s body is and how they experience it, and it is a poor match for how the body actually looks.

Suicide risk assessment for LGBTQ+ young people lists "issues related to body image" as a factor, and there are two distinct threads behind it. One is the appearance culture inside parts of queer community life, which can be narrow and heavily enforced. The other is gender dysphoria, where the distress concerns sexed characteristics rather than shape or size, and where the useful response is gender affirmation rather than anything addressed to body image as such.

Treating the second as though it were the first is a specific and common mistake, and it is why the two are separate entries here.'),

  ('intergenerational-trauma', 'Intergenerational Trauma', 'mental-health', null,
   'Harm from events in an earlier generation that continues to affect the ones after it, through family, community and institutions. Guidance asks that suicide risk be understood against this background for Aboriginal and Torres Strait Islander people.',
   'Harm from an earlier generation still affecting the ones that follow.',
   'Intergenerational trauma describes harm that outlives the people it happened to, carried forward through families, communities and the institutions that caused it.

Guidance on suicide prevention for Aboriginal and Torres Strait Islander LGBTQA+ young people asks providers to hold a holistic view of suicidal thoughts and behaviour as the interplay of individual, social, cultural and historic influences, and names the impact of intergenerational trauma among the contributing factors. It sits alongside a related instruction: to recognise that a person may face discrimination on both counts at once, including racial prejudice within LGBTQ+ communities.

The concept applies wherever a population has been systematically harmed, and queer histories contain their own instances — criminalisation, institutionalisation, and a generation lost to the AIDS crisis.'),

  -- ── identity and culture terms the guideline defines ─────────────────────
  ('neurodivergent', 'Neurodivergent', 'questioning-labels', null,
   'Having a mind that works in a way society treats as atypical — autism, ADHD, dyslexia, dyspraxia and others. Suicide prevention guidance treats neurodivergent LGBTQ+ young people as a group with distinct needs, not as a complication.',
   'Having a mind that works in a way society treats as atypical.',
   'Neurodivergent describes people whose patterns of thought, attention or perception differ from what is treated as standard — autistic people, people with ADHD, dyslexia or dyspraxia, among others. The framing is deliberate: it locates the difficulty in the fit between a person and their environment rather than solely in the person.

It appears in LGBTQ+ suicide prevention guidance as a population needing specific consideration, and the overlap is substantial — neurodivergent people are more likely to be trans or non-heterosexual than the general population. In practice that means an assessment may need to change shape: indirect questions about feelings can be harder to answer than direct ones, sensory conditions in a clinic room affect whether anything useful happens, and a flat delivery is not evidence that someone is not distressed.'),

  ('brotherboy', 'Brotherboy', 'gender-identity', null,
   'A term used by some Aboriginal and Torres Strait Islander trans people who identify as male. It carries cultural meaning as well as gender, and it is used by Aboriginal and Torres Strait Islander people about themselves.',
   'A term used by some Aboriginal and Torres Strait Islander trans people who identify as male.',
   'Brotherboy is a term used by some Aboriginal and Torres Strait Islander trans people who identify as male.

It is not simply a regional synonym for "trans man". It carries cultural and community meaning alongside gender, and it belongs to the people who use it — guidance on working with Aboriginal and Torres Strait Islander LGBTQA+ young people asks providers to use culturally appropriate language, giving Brotherboy and Sistergirl as the examples, and to be led by the individual rather than assuming the term applies.

Usage and meaning vary between communities. The entry is here so the word is recognised and used correctly, not so it can be applied to someone who has not used it themselves.'),

  ('sistergirl', 'Sistergirl', 'gender-identity', null,
   'A term used by some Aboriginal and Torres Strait Islander trans people who identify as female. It carries cultural meaning as well as gender, and it is used by Aboriginal and Torres Strait Islander people about themselves.',
   'A term used by some Aboriginal and Torres Strait Islander trans people who identify as female.',
   'Sistergirl is a term used by some Aboriginal and Torres Strait Islander trans people who identify as female.

As with Brotherboy, it is not a regional substitute for "trans woman". It carries cultural and community meaning alongside gender, and guidance on suicide prevention asks providers to use such language as guided by the young person, rather than applying it because it appears to fit.

Usage varies between communities, and Tiwi Islands Sistergirls are the most publicly known group but not the only one. The entry exists so the word is recognised, not so it can be assigned to anyone.'),

  ('gender-neutral-bathroom', 'Gender-Neutral Bathroom', 'safe-spaces', null,
   'A toilet not designated by gender. Access to an appropriate bathroom appears in LGBTQ+ suicide risk assessment as a real factor rather than a matter of comfort, because being unable to use one safely shapes whether a person can attend school or work at all.',
   'A toilet not designated by gender — an access issue, not a comfort one.',
   'A gender-neutral bathroom is one anybody can use, usually a single lockable room. In practice it is also the option that resolves the most situations at once: it serves trans and non-binary people, and equally a disabled person with an opposite-gender carer or a parent with a child.

Suicide risk assessment for LGBTQ+ young people lists difficulties in educational settings, giving "access to gender-appropriate bathrooms" as its first example, alongside staff refusing to use a chosen name or pronouns. It is on that list because the consequences are not confined to the bathroom: people who cannot safely use one stop drinking water during the day, develop urinary and kidney problems, avoid being in the building, and eventually stop turning up.

Providing one is also among the cheapest changes a service can make to signal that it has thought about this at all — which is the function guidance assigns it in the section on creating an affirming environment.');

  ---------------------------------------------------------------------------
  -- 1. Create. One row per statement. `on conflict (slug) do update` makes the
  --    file re-runnable and would also adopt a row that appeared between
  --    writing and applying.
  ---------------------------------------------------------------------------
  for r in select * from _new order by slug loop
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description,
      long_description, wikidata_id, verification_status, human_reviewed,
      seo_indexable, last_verified_at
    ) values (
      r.name, r.slug, 'concept', 'active', r.descr, r.shortd, r.longd, r.qid,
      'reviewed', true, true, now()
    )
    on conflict (slug) do update set
      status              = 'active',
      description         = excluded.description,
      short_description   = excluded.short_description,
      long_description    = excluded.long_description,
      wikidata_id         = coalesce(excluded.wikidata_id, public.unified_tags.wikidata_id),
      verification_status = 'reviewed',
      human_reviewed      = true,
      seo_indexable       = true,
      merged_into_id      = null,
      deprecated_at       = null,
      deprecation_reason  = null,
      last_verified_at    = now(),
      updated_at          = now();
  end loop;

  ---------------------------------------------------------------------------
  -- 2. Category assignment, one row per statement.
  ---------------------------------------------------------------------------
  for r in select * from _new order by slug loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    continue when v_tag_id is null;
    select id into strict v_cat_id from public.tag_categories where slug = r.cat;

    update public.tag_category_assignments
       set is_primary = false
     where tag_id = v_tag_id and category_id <> v_cat_id;

    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (v_tag_id, v_cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;

    update public.unified_tags
       set category_id = v_cat_id, updated_at = now()
     where id = v_tag_id and category_id is distinct from v_cat_id;
  end loop;

  ---------------------------------------------------------------------------
  -- 3. `suizid` folds into `suicide`. It is the German word, carried in as a
  --    scraper hashtag with no description, no Wikidata and no assignments, and
  --    it occupied the slug space this concept needed. Merging rather than
  --    deprecating keeps /tags/suizid resolving — merge_tag_concept creates the
  --    alias, and trg_unified_tags_merge_redirect mints the 301 against the
  --    canonical tag, so this does not move redirect_to_non_canonical.
  --
  --    Before aliases, per tag_alias_reject_shadow.
  ---------------------------------------------------------------------------
  select id into v_canon_id from public.unified_tags where slug = 'suicide';
  select id into v_dup_id   from public.unified_tags where slug = 'suizid' and status <> 'merged';
  if v_canon_id is not null and v_dup_id is not null then
    perform public.merge_tag_concept(v_canon_id, v_dup_id,
      'lgbtqa-prevention-3', 'german-language scraper stub occupying the suicide slug');
  end if;

  perform set_config('app.actor', 'admin:lgbtqa-prevention-3-20260829', true);

  ---------------------------------------------------------------------------
  -- 4. Ontology. Skipped rather than invented where a target is missing.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('suicide',                  'mental-health'),
      ('exposure-to-suicide',      'suicide'),
      ('safety-planning',          'suicide-prevention'),
      ('help-seeking',             'mental-health'),
      ('social-isolation',         'minority-stress'),
      ('bullying',                 'violence'),
      ('housing-instability',      'minority-stress'),
      ('vicarious-trauma',         'trauma'),
      ('intergenerational-trauma', 'trauma'),
      ('body-image',               'mental-health'),
      ('brotherboy',               'transgender'),
      ('sistergirl',               'transgender'),
      ('gender-neutral-bathroom',  'safe-space')
    ) as v(child, parent)
  loop
    select id into v_tag_id from public.unified_tags where slug = r.child  and status = 'active';
    select id into v_rel_id from public.unified_tags where slug = r.parent and status = 'active';
    continue when v_tag_id is null or v_rel_id is null or v_tag_id = v_rel_id;

    insert into public.tag_relations
      (source_tag_id, target_tag_id, relation_type, confidence, review_status)
    values (v_tag_id, v_rel_id, 'broader', 1.0, 'approved')
    on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
  end loop;

  ---------------------------------------------------------------------------
  -- 5. Aliases. Guarded against shadowing a live tag. Note what is NOT here:
  --    no alias for `bullying` resembling "bully", which is a live tag meaning
  --    something else entirely on this site.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('safety-planning',         'Safety plan'),
      ('help-seeking',            'Help seeking behaviour'),
      ('housing-instability',     'Youth homelessness'),
      ('gender-neutral-bathroom', 'All-gender bathroom'),
      ('gender-neutral-bathroom', 'Unisex toilet'),
      ('bullying',                'Cyberbullying'),
      ('neurodivergent',          'Neurodiversity')
    ) as v(slug, alias)
  loop
    select id into v_tag_id from public.unified_tags where slug = r.slug and status = 'active';
    continue when v_tag_id is null;
    a := r.alias;

    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    select v_tag_id, a, public.normalize_tag_slug(a), 'synonym', 'approved'
    where not exists (
      select 1 from public.unified_tags u
       where lower(u.slug) = public.normalize_tag_slug(a)
         and u.status = 'active' and u.id <> v_tag_id)
    on conflict (alias_slug) do nothing;
  end loop;

  perform public.recount_all_tag_usage(500);
end
$mig$;

do $verify$
declare v_n int; v_txt text;
begin
  -- All fourteen created, reviewed, categorised, and readable.
  select count(*) into v_n from public.unified_tags t
   where t.slug in ('suicide','exposure-to-suicide','safety-planning','help-seeking','social-isolation',
                    'bullying','housing-instability','vicarious-trauma','body-image',
                    'intergenerational-trauma','neurodivergent','brotherboy','sistergirl',
                    'gender-neutral-bathroom')
     and t.status = 'active' and t.human_reviewed
     and t.verification_status in ('reviewed','locked') and t.seo_indexable
     and t.category_id is not null
     and coalesce(nullif(btrim(t.description), ''), t.short_description) is not null;
  if v_n <> 14 then
    raise exception 'prevention-3: expected 14 new rows, found %', v_n;
  end if;

  -- Slugs survive the BEFORE triggers unchanged. normalize_tag_slug rewrites
  -- on insert, so asserting the value we asked for is not redundant.
  select count(*) into v_n from public.unified_tags
   where slug in ('gender-neutral-bathroom','intergenerational-trauma','exposure-to-suicide');
  if v_n <> 3 then
    raise exception 'prevention-3: a slug was rewritten by the normalize triggers';
  end if;

  ---------------------------------------------------------------------------
  -- SAFE MESSAGING. These assertions are the reason this file can publish a
  -- page about suicide at all. A later edit that reintroduces any of it is a
  -- safety regression, and it fails here rather than reaching a reader.
  ---------------------------------------------------------------------------
  select coalesce(long_description,'') || ' ' || coalesce(description,'')
    into v_txt from public.unified_tags where slug = 'suicide';

  -- No method, means or location. Deliberately blunt: the point is that none
  -- of this vocabulary belongs on the page in any framing.
  --
  -- \y (word boundary) on every single-word alternative is load-bearing, not
  -- tidiness. Without it this guard fired on its own migration: `hang` matches
  -- inside "c-hang-ed", so the sentence "the conditions that raise the risk can
  -- be changed" was rejected as naming a method. An unanchored deny-list on
  -- short words like hang / hung / wrist / bridge / poison is unusable.
  if v_txt ~* '\y(hang|hangs|hanged|hanging|hung|noose|ligature|firearm|firearms|gunshot|poison|poisons|poisoned|poisoning|wrist|wrists|bridge|bridges|railway|overdose|overdoses|overdosed|overdosing)\y'
     or v_txt ~* '(jump(ed|ing)? (from|off)|shot (him|her|them)self|train tracks?|carbon monoxide|lethal dose|how to (kill|end))' then
    raise exception 'prevention-3: suicide prose names a method, means or location';
  end if;

  -- Not a solution, not a release, not an understandable way out.
  if v_txt ~* '(end (the|their|his|her) (pain|suffering)|way out|no other option|at peace now|escape from life|solution to)' then
    raise exception 'prevention-3: suicide prose frames suicide as a solution or release';
  end if;

  -- Criminalising and scorekeeping language.
  --
  -- Tested with QUOTED spans removed, unlike the method guard above. The entry
  -- teaches the language rule, and teaching it requires naming the phrase to
  -- avoid — so `Say "died by suicide" rather than "committed suicide"` is a
  -- mention, not a use, and a blunt scan rejects the very sentence that fixes
  -- the problem. Method vocabulary gets no such exemption: there is no
  -- didactic reason to print it, quoted or otherwise.
  if regexp_replace(v_txt, '"[^"]*"', '', 'g')
       ~* '(committed suicide|successful (suicide|attempt)|failed (suicide|attempt)|unsuccessful attempt)' then
    raise exception 'prevention-3: suicide prose uses committed/successful/failed framing outside a quotation';
  end if;

  -- And the two things that must be PRESENT: the language note, and a route to
  -- help. Absence assertions alone would pass on an empty page.
  if v_txt !~* 'died by suicide' then
    raise exception 'prevention-3: suicide prose must state the died-by-suicide language rule';
  end if;
  if v_txt !~* 'crisis line' then
    raise exception 'prevention-3: suicide prose must route a reader in danger to help';
  end if;

  -- The risk statement must keep its cause attached. "LGBTQ+ people are at
  -- higher risk", published without it, is the sentence that does harm.
  if v_txt !~* 'stigma' or v_txt !~* 'not because of who they are' then
    raise exception 'prevention-3: suicide prose must attribute raised risk to stigma, not identity';
  end if;

  -- The German stub folded in rather than being stranded.
  select count(*) into v_n from public.unified_tags d
    join public.unified_tags c on c.id = d.merged_into_id
   where d.slug = 'suizid' and d.status = 'merged' and c.slug = 'suicide';
  if v_n <> 1 then
    raise exception 'prevention-3: suizid did not merge into suicide';
  end if;

  -- The redirect must point at the canonical tag. Filed against the merged row
  -- instead, it would push redirect_to_non_canonical off its baseline and red
  -- the hygiene ratchet.
  select count(*) into v_n from public.tag_slug_redirects rd
    join public.unified_tags t on t.id = rd.tag_id
   where rd.old_slug = 'suizid' and rd.new_slug = 'suicide' and t.status = 'active';
  if v_n <> 1 then
    raise exception 'prevention-3: the suizid redirect is not filed against an active tag';
  end if;

  -- `bully` is a different concept and must not have been touched.
  select count(*) into v_n from public.unified_tags
   where slug = 'bully' and status = 'active';
  if v_n <> 1 then
    raise exception 'prevention-3: the unrelated `bully` tag was disturbed';
  end if;
end
$verify$;
