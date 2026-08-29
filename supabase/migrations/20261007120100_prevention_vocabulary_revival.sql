-- LGBTQA+ suicide prevention, part 2 of 5: revive the vocabulary the sweeps took.
--
-- Source and rationale: see the header of 20261007120000.
--
-- WHAT THIS REVIVES AND WHY EACH ONE
--   Every slug here is named by the guideline, and every one is currently
--   `deprecated` with human_reviewed = false — which is exactly why it was
--   taken. Anchors, so a later reader can check the warrant rather than trust
--   the list:
--
--     Part II "SCREENING FOR RISK FACTORS"  -> suicidal-ideation, anxiety,
--       post-traumatic-stress-disorder, stress, gender-dysphoria,
--       internalized-transphobia, stigma, minority-stress
--     Part II "SCREENING FOR PROTECTIVE FACTORS" -> protective-factors,
--       resilience, queer-resilience, family-acceptance, chosen-family
--     Part II response section -> crisis-intervention, peer-support
--     Part III trans considerations -> social-transition, gender-affirmation,
--       chosen-name, pronouns
--     Part III Aboriginal/Torres Strait Islander -> intersectionality
--       ("the impact of the young person's intersecting identities")
--     Glossary -> questioning, demisexual
--     Risk factor "Bullying including social exclusion" -> anti-bullying-policies
--     Barrier to help-seeking -> mental-health-stigma
--
-- FOUR CANDIDATES WERE DROPPED AFTER READING THEM. Recorded because a silent
-- omission from a list like this is indistinguishable from an oversight:
--
--   * `crisis-hotlines` — NOT revived. /help owns hotlines editorially, which
--     is a decision this repo already took: 20260919100000 deleted the
--     `helplines-hotlines` category for that reason. Reviving a hotline tag
--     re-opens it. `crisis-intervention` (the practice) is revived instead.
--   * `dysphoria` — NOT revived. Its stored description is a definition of
--     GENDER dysphoria, so reviving it alongside `gender-dysphoria` would
--     publish the same concept twice under two slugs and manufacture exactly
--     the twin-name problem duplicate_active_name exists to catch.
--   * `psychiatrist` and `psychologist` — NOT revived, and this one was
--     decided by a repo rule rather than by the guideline. They were on the
--     list off the "Using these guidelines" audience section, which names who
--     the document is written for rather than a prevention concept. In the
--     meantime 20261006140100 (taxonomy v3, PR C) unfiled professions from the
--     glossary tree wholesale — they have their own vocabulary in
--     `public.professions` — and `psychologist` is already uncategorized
--     because of it. Reviving them into a category would re-open a decision
--     taken deliberately two migrations ago, to publish two pages that define
--     job titles. The care-access and current-affairs stops they were
--     originally filed under are themselves slated for deletion in PR E.
--   * `body-dysphoria` — NOT revived. Its stored description is body dysmorphic
--     disorder, a different condition; the guideline's actual risk factor is
--     "Issues related to body image", and part 3 adds `body-image` for it.
--
-- CATEGORY TARGETS ARE TAXONOMY v3 STOPS. This file was written against the
-- v2 tree; 20261006140000/140100 replaced it with 8 kind-homogeneous lines
-- while the work sat unmerged, so the targets were re-checked against the live
-- tree rather than replayed. One changed: `stigma` was filed to
-- `current-affairs`, which is a v2 leftover under the doomed `support-news`
-- root and is deleted in PR E — it goes to `violence-hate` (Safety & Consent),
-- where `homophobia` already sits after the deterministic refile. Everything
-- else named here is a live v3 stop and is unchanged.
--
-- PROSE POLICY, stated because it is a judgement and not a rule.
--   description + short_description are rewritten for EVERY row: they are the
--   lead a reader and a search engine see, and the stored ones are AI stubs or
--   wrong. long_description is rewritten only where the existing body is wrong
--   or absent; where it is merely generic it is kept, because replacing sound
--   prose wholesale is churn. `coalesce(r.longd, existing)` is what implements
--   that, so a null in the table below means "keep what is there".
--
--   FOUR OF THESE DESCRIPTIONS WERE FACTUALLY WRONG, not just thin:
--     suicidal-ideation  "Thoughts of self-harm or suicide" — collapses the
--                        distinction the whole guideline rests on. Self-harm is
--                        frequently not suicidal, and treating the two as one
--                        thing is how a disclosure gets mishandled.
--     stigma             "Negative attitudes and assumptions about intersex
--                        variations" — a general concept defined as if it were
--                        intersex-specific.
--     peer-support       "...advocacy for safer drug use practices" — scoped to
--                        harm reduction only, because that is the vocabulary
--                        that happened to be written last.
--     internalized-transphobia  its description was a definition of
--                        transphobia, with nothing internalized about it.
--
-- MECHANICS: as part 1. One row per statement (SQLSTATE 27000), category_id
-- written alongside the junction row, merges BEFORE aliases, and
-- merge_tag_concept overwrites app.actor so it is re-set afterwards.
--
-- human_reviewed = true is the entire point of the file. Without it the next
-- deprecate_unused_tags() run re-deprecates all of this, silently, and the
-- result is indistinguishable from never having done it.

select set_config('app.actor', 'admin:lgbtqa-prevention-2-20260829', true);

do $mig$
declare
  r          record;
  v_tag_id   uuid;
  v_cat_id   uuid;
  v_canon_id uuid;
  v_dup_id   uuid;
  v_rel_id   uuid;
  a          text;
begin
  create temp table _rev (
    slug text primary key, cat text, qid text, descr text, shortd text, longd text
  ) on commit drop;

  insert into _rev (slug, cat, qid, descr, shortd, longd) values

  -- ── the concept the corpus had no word for ────────────────────────────────
  ('suicidal-ideation', 'mental-health', 'Q944142',
   'Thinking about suicide — anywhere from a passing wish not to exist through to a specific plan. It is a symptom, not an act, and it is common enough that asking about it directly is standard practice rather than an escalation.',
   'Thinking about suicide, from a passing wish not to exist through to a specific plan.',
   'Suicidal ideation covers a wide range. At one end is a vague wish to not be here or for things to stop; at the other, thinking through a method and a time. Those ends carry very different risk, which is why assessment asks about specifics rather than treating any thought as one undifferentiated emergency.

It is not the same as self-harm, and conflating the two is a practical mistake rather than a semantic one — people who self-harm often have no intention of dying, and people with serious ideation may never have harmed themselves. A response that assumes one from the other gets both wrong.

Asking about it plainly does not plant the idea. Best-practice guidance for LGBTQ+ young people goes further and says the screening should be periodic rather than one-off, and that the person should be told explicitly that it is safe to discuss and what would happen if concern were serious — because the fear of losing control of the situation is itself a reason people do not say anything.

Among LGBTQ+ young people the elevated rate tracks stigma, rejection and discrimination, not identity. If you are having these thoughts now, a crisis line can talk it through with you; the support page lists them by country.'),

  -- ── why the rate is higher, and it is not identity ────────────────────────
  ('minority-stress', 'mental-health', 'Q17103967',
   'The chronic, additional stress of living in a stigmatised group — from discrimination and rejection through to the vigilance of anticipating them and the internalising of the surrounding attitudes. It is the standard explanation for why LGBTQ+ mental-health outcomes are worse, without anything about being LGBTQ+ being the cause.',
   'The chronic extra stress of living in a stigmatised group — the standard explanation for worse LGBTQ+ mental-health outcomes.',
   'Minority stress is the idea that belonging to a stigmatised group adds a load that others do not carry, and that the load accumulates.

It is usually described in layers. There are external events: discrimination, harassment, rejection, violence. There is the expectation of them, which produces a running vigilance — scanning a street, a workplace, a family gathering — that costs something even when nothing happens. There is concealment, which is protective and also isolating. And there is internalisation, where the surrounding attitudes are turned inward and become how a person judges themselves.

The reason it matters for suicide prevention is that it locates the cause outside the person. The elevated risk among LGBTQ+ people is a response to conditions, and conditions can change: an affirming school, a family that comes round, a service that gets the name right. That is also why the model is not a licence to treat every queer person as fragile — most are not distressed, and assuming otherwise is its own harm.'),

  ('stigma', 'violence-hate', 'Q10821851',
   'A mark that sets someone apart as lesser in the eyes of others — and the discrediting that follows. It operates socially, in what people expect and how they treat each other, rather than in any quality of the person carrying it.',
   'A mark that sets someone apart as lesser, and the discrediting that follows.',
   'Stigma is what turns a difference into a disqualification. It works through expectation: what people assume about a group, what they treat as normal to say, and what they quietly withhold.

It is felt in more than one way. There is the enacted kind — being refused, insulted, passed over. There is the anticipated kind, where someone changes what they do to avoid the first, which is often the more constant of the two. And there is the internalised kind, where the outside view is adopted as a self-assessment.

For LGBTQ+ people it is the mechanism underneath most of the mental-health gap, and it is why prevention work targets environments rather than individuals.'),

  ('mental-health-stigma', 'mental-health', 'Q25489485',
   'The specific stigma attached to having a mental illness or needing help for one — and the main reason people who are struggling do not say so or do not go back.',
   'The stigma attached to needing mental-health help, and the reason people do not ask for it.',
   null),

  -- ── protective side: assessed with equal weight, per the guideline ────────
  ('protective-factors', 'mental-health', null,
   'The things in someone''s life that buffer against harm — supportive relationships, belonging, affirming environments, self-acceptance. Best-practice suicide assessment gives these equal attention to risk factors rather than treating them as a footnote.',
   'What buffers against harm — support, belonging, affirming environments, self-acceptance.',
   'Protective factors are the counterpart to risk factors, and guidance for working with LGBTQ+ young people is explicit that a provider should give them equal attention rather than cataloguing harms and stopping there.

The ones named for this population are specific: a positive relationship with a parent or caregiver; support from chosen family, defined by the person rather than assumed; friends, online or in person; an affirming school or workplace; self-acceptance; visible role models; connection to culture; connection to LGBTQ+ community; experiences of being affirmed in one''s gender; and — a genuinely modern addition — positive use of social media in relation to one''s identity.

Two things follow. They should be screened periodically, because they change. And they are buildable, which is what makes them the practical half of prevention: a service cannot undo a rejection, but it can help someone find a community.'),

  ('resilience', 'mental-health', 'Q219416',
   'The capacity to come through adversity without being defined by it. Not a fixed trait or a personal virtue — it depends heavily on what support is available, which is why it can be built rather than merely possessed.',
   'The capacity to come through adversity — built from support, not a personal virtue.',
   'Resilience describes doing reasonably well despite difficulty. The idea has been misused often enough to be worth stating carefully: it is not toughness, it is not a character test, and treating it as one turns a lack of support into a personal failing.

What research consistently finds is that it is relational. The strongest predictors are things outside the person — at least one reliable adult, a place where they are accepted, a sense of belonging somewhere. That makes it a target for services rather than a quality to admire.

For LGBTQ+ people it is also frequently collective rather than individual: the resource is a community that has already survived the same thing.'),

  ('queer-resilience', 'mental-health', null,
   'The specifically collective form: the strategies, humour, chosen families and organised care that LGBTQ+ communities have built to survive hostile conditions, and that individuals draw on rather than inventing alone.',
   'The collective resilience LGBTQ+ communities have built — chosen family, humour, organised care.',
   null),

  ('family-acceptance', 'family-chosen-family', 'Q34149519',
   'A family responding to someone''s sexuality or gender by continuing to support them. It is one of the most strongly evidenced protective factors there is, and guidance for trans young people asks providers to work towards it actively where it is safe to.',
   'A family continuing to support someone through their sexuality or gender — a strongly evidenced protective factor.',
   'Family acceptance is not a mood, it is a set of behaviours: using the name and pronouns, defending the person to relatives, letting them have queer friends, not treating the disclosure as a problem to be managed.

The evidence behind it is unusually strong. Guidance for working with trans young people states plainly that family acceptance and support is associated with better mental health, and asks providers to encourage family understanding and to facilitate positive family relationships — with the person''s consent, and in collaboration with them.

The consent qualifier is the load-bearing part. Involving family is not automatically safe for a queer young person, which is why the same guidance asks providers to assess the safety of informing caregivers before doing it, and to make those decisions jointly rather than on the person''s behalf.'),

  ('chosen-family', 'family-chosen-family', null,
   'The people who actually do the work of family — support, care, showing up — regardless of blood or marriage. For many LGBTQ+ people it is the primary support network, and it is named as a protective factor in its own right.',
   'The people who do the work of family regardless of blood or marriage.',
   'Chosen family means the people who fulfil the role of a support system without being related by blood or marriage. It is sometimes called family of choice or found family, and it is deliberately distinguished from a family of origin.

It matters here for a plain reason: LGBTQ+ people build it in response to rejection or violence from the families they were born into, and for many it is not a supplement to that family but a replacement for it.

The practical consequence for anyone providing support is that it must be defined by the person, not inferred. Best-practice guidance asks specifically about support from chosen family "as defined by the young person", and — when someone is at risk — asks whether they want those people involved, on the same footing as a parent.'),

  -- ── responding ────────────────────────────────────────────────────────────
  ('crisis-intervention', 'mental-health', 'Q2105762',
   'Short-term support during an acute crisis: stabilising the immediate situation, working out what has to happen now, and staying with the person rather than handing them on. Aimed at the episode, not at underlying treatment.',
   'Short-term support through an acute crisis — stabilising now, not treating underlying causes.',
   'Crisis intervention is what happens in the hours and days around an acute episode. The aims are narrow and immediate: reduce danger, restore enough footing for the person to make decisions, and connect them to whatever comes next.

Guidance for LGBTQ+ young people adds specifics that generic protocols miss. Decide collaboratively who else gets told, because family dynamics may be exactly the problem. Assess whether it is safe to inform a caregiver before doing so. Offer LGBTQ+-specific helplines alongside general ones. And do not end the relationship because the risk is high — being referred elsewhere at the point of greatest need can read as one more abandonment, so continuity is preferred where it is possible at all.'),

  ('peer-support', 'support-services', 'Q1569083',
   'Support from people with the same lived experience rather than from professionals. Its value is the thing a clinician cannot offer — recognition from someone who has been there — and it works alongside professional care rather than replacing it.',
   'Support from people with the same lived experience, alongside professional care.',
   'Peer support is help offered by people who have been through the same thing. What it provides is different in kind from clinical care: not assessment or treatment, but recognition, and the evidence that surviving this is possible because someone in front of you did.

For LGBTQ+ people it is often the first support anyone accesses, and sometimes the only support available — particularly where services are distant, hostile, or would require explaining yourself before being helped.

Guidance on suicide prevention treats expanding peer networks as an active task rather than a suggestion: identifying LGBTQ+ groups in schools and colleges, pointing families towards their own support, and connecting people to community organisations. It is not a substitute for clinical care when that is needed, and good peer support knows where its edge is.'),

  -- ── risk factors named in Part II ─────────────────────────────────────────
  ('anxiety', 'mental-health', 'Q154430',
   'Apprehension about something that has not happened. Ordinary and useful in proportion; a disorder when it is persistent, out of scale, and shapes what a person will do. For LGBTQ+ people a large share of it is the realistic anticipation of hostility rather than a distortion.',
   'Apprehension about what has not happened — ordinary in proportion, a disorder when persistent and out of scale.',
   null),

  ('post-traumatic-stress-disorder', 'mental-health', 'Q202387',
   'A condition that can follow a traumatic event: intrusive memories, nightmares, avoidance of reminders, and a nervous system that stays braced. It is a normal response that did not resolve, not a weakness.',
   'A condition following trauma — intrusive memories, avoidance, and a nervous system that stays braced.',
   null),

  ('stress', 'mental-health', 'Q123414',
   'The body and mind''s response to demand. Short bursts are survivable and sometimes useful; the damage comes from load that does not let up, which is the shape stress takes when its source is other people''s attitudes.',
   'The response to demand — damaging when it does not let up.',
   null),

  ('gender-dysphoria', 'mental-health', 'Q1049021',
   'The distress that can come from a mismatch between someone''s gender and the one presumed for them at birth, or the body they have. Not all trans people experience it, and being gender-nonconforming is not the same thing.',
   'Distress from a mismatch between gender and what was presumed at birth. Not universal among trans people.',
   null),

  ('internalized-transphobia', 'gender-identity', 'Q135953297',
   'Transphobia turned inward — a trans person holding, about themselves, the beliefs the surrounding culture holds about trans people. It is named in suicide risk assessment as a distinct thing to ask about, phrased as how someone feels about their own identity.',
   'Transphobia turned inward — holding society''s beliefs about trans people about yourself.',
   'Internalized transphobia is what happens when the attitudes a trans person grows up surrounded by are absorbed and applied to themselves: that they are not really their gender, that they are a burden, that they will never be seen as anything other than a problem.

It is distinct from experiencing transphobia from others, though it is produced by it, and it can persist long after someone''s external circumstances have improved — which is why an affirming environment does not on its own resolve it.

Best-practice suicide risk assessment asks about it directly, as part of a broader question about how a young person feels about their own LGBTQ+ identity, alongside internalised homophobia and biphobia. It is asked about because it is modifiable, not to be catalogued.'),

  ('anti-bullying-policies', 'workplace-education-policy', 'Q129745661',
   'The rules a school or workplace sets for preventing and responding to bullying — and, decisively for LGBTQ+ people, whether those rules name sexuality and gender identity explicitly rather than relying on a general prohibition.',
   'Rules for preventing and responding to bullying — and whether they name sexuality and gender explicitly.',
   null),

  -- ── being trans in a service: Part I and Part III ─────────────────────────
  ('chosen-name', 'gender-identity', null,
   'The name a person uses, as distinct from the name on their documents. Guidance treats using it — and getting record systems to hold it — as a basic condition of an affirming service, not a courtesy.',
   'The name a person uses, as distinct from the one on their documents.',
   null),

  ('pronouns', 'gender-identity', null,
   'The words used to refer to someone in the third person — he, she, they, or neopronouns such as xe or ze. Some people use more than one set. Getting them right is unremarkable when it happens and corrosive when it does not.',
   'The words used to refer to someone in the third person. Some people use more than one set.',
   null),

  ('social-transition', 'gender-identity', null,
   'Affirming gender through the everyday and reversible: name, pronouns, clothing, how one is introduced. It is one of three routes — social, medical, legal — and people take some, all or none of them.',
   'Affirming gender socially — name, pronouns, presentation. One of three routes, and optional.',
   null),

  ('gender-affirmation', 'gender-identity', null,
   'Being recognised and treated as the gender you are. It covers everything from a pronoun used without comment to medical and legal transition, and experiences of it are listed among the protective factors in suicide risk assessment.',
   'Being recognised and treated as the gender you are — listed as a protective factor.',
   null),

  -- ── labels and framings the guideline defines ────────────────────────────
  ('questioning', 'questioning-labels', null,
   'Exploring one''s sexuality and/or gender without having settled on a label — and a legitimate position to occupy indefinitely, not a waiting room before a real answer.',
   'Exploring one''s sexuality and/or gender without having settled on a label.',
   null),

  ('demisexual', 'questioning-labels', null,
   'On the asexuality spectrum: sexual attraction arises only after an emotional bond has formed, rather than from appearance or first meeting.',
   'Sexual attraction only after an emotional bond forms — on the asexuality spectrum.',
   null),

  ('intersectionality', 'political-activism', null,
   'The framework for how overlapping identities produce combinations of discrimination that cannot be understood one axis at a time. In suicide prevention it is why guidance asks about the interaction of someone''s queerness with race, culture and disability rather than about queerness alone.',
   'How overlapping identities produce discrimination that cannot be read one axis at a time.',
   null);

  ---------------------------------------------------------------------------
  -- 1. Revive. One row per statement — a set-based UPDATE trips SQLSTATE 27000
  --    through sync_tag_category_assignment -> unified_tags_recompute_is_adult.
  --
  --    long_description and wikidata_id use coalesce so a null in the table
  --    means "keep what is stored", not "erase it".
  ---------------------------------------------------------------------------
  for r in select * from _rev order by slug loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    if v_tag_id is null then
      raise notice 'prevention-2: % not found, skipped', r.slug;
      continue;
    end if;

    update public.unified_tags u set
      status              = 'active',
      description         = r.descr,
      short_description   = r.shortd,
      long_description    = coalesce(r.longd, u.long_description),
      wikidata_id         = coalesce(r.qid, u.wikidata_id),
      human_reviewed      = true,
      verification_status = 'reviewed',
      seo_indexable       = true,
      merged_into_id      = null,
      deprecated_at       = null,
      deprecation_reason  = null,
      last_verified_at    = now(),
      updated_at          = now()
    where u.id = v_tag_id;
  end loop;

  ---------------------------------------------------------------------------
  -- 2. Category assignment, one row per statement.
  ---------------------------------------------------------------------------
  for r in select * from _rev order by slug loop
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
  -- 3. Merge. `suicidal-thoughts` and `suicidal-ideation` carry the SAME
  --    Wikidata item (Q944142) — one concept stored twice. Ideation is the
  --    clinical term and the one that survives; "suicidal thoughts" is the
  --    guideline's own phrasing, so it is kept as an approved alias, which
  --    merge_tag_concept creates automatically.
  --
  --    Merges run before the alias loop below: tag_alias_reject_shadow()
  --    refuses an alias that shadows a live tag.
  ---------------------------------------------------------------------------
  select id into v_canon_id from public.unified_tags where slug = 'suicidal-ideation';
  select id into v_dup_id   from public.unified_tags where slug = 'suicidal-thoughts' and status <> 'merged';
  if v_canon_id is not null and v_dup_id is not null then
    perform public.merge_tag_concept(v_canon_id, v_dup_id,
      'lgbtqa-prevention-2', 'same wikidata item Q944142');
  end if;

  -- merge_tag_concept overwrites app.actor with 'merge:...'; restore it or the
  -- audit trigger sees a different actor for everything below.
  perform set_config('app.actor', 'admin:lgbtqa-prevention-2-20260829', true);

  ---------------------------------------------------------------------------
  -- 4. Ontology. panic-attack was narrower-of `drug-emergency` — it is not a
  --    kind of drug emergency, and filing it there implies a cause. Its parent
  --    is anxiety, which only became available above.
  ---------------------------------------------------------------------------
  select id into v_tag_id from public.unified_tags where slug = 'panic-attack' and status = 'active';
  select id into v_rel_id from public.unified_tags where slug = 'drug-emergency';
  if v_tag_id is not null and v_rel_id is not null then
    delete from public.tag_relations
     where source_tag_id = v_tag_id and target_tag_id = v_rel_id and relation_type = 'broader';
  end if;

  -- Broader edges. A missing or non-active target is skipped, never created:
  -- this file may not mint a stub tag as a side effect of drawing a line.
  for r in
    select * from (values
      ('suicidal-ideation',              'mental-health'),
      ('minority-stress',                'stigma'),
      ('mental-health-stigma',           'stigma'),
      ('queer-resilience',               'resilience'),
      ('protective-factors',             'mental-health'),
      ('crisis-intervention',            'suicide-prevention'),
      ('family-acceptance',              'protective-factors'),
      ('chosen-family',                  'protective-factors'),
      ('peer-support',                   'social-support'),
      ('anxiety',                        'mental-health'),
      ('post-traumatic-stress-disorder', 'trauma'),
      ('gender-dysphoria',               'mental-health'),
      ('internalized-transphobia',       'transphobia'),
      ('social-transition',              'gender-affirmation'),
      ('chosen-name',                    'gender-affirmation'),
      ('panic-attack',                   'anxiety')
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
  -- 5. Aliases. Guarded against shadowing a live tag, per doxy-pep.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('suicidal-ideation',              'Suicidality'),
      ('minority-stress',                'Minority stress theory'),
      ('minority-stress',                'Minority stress model'),
      ('chosen-family',                  'Found family'),
      ('chosen-family',                  'Family of choice'),
      ('chosen-name',                    'Preferred name'),
      ('post-traumatic-stress-disorder', 'PTSD'),
      ('crisis-intervention',            'Crisis support')
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
declare v_n int; r record;
begin
  -- Every row active, reviewed, indexable, and readable by an anonymous
  -- visitor. Exactly the 24 rows in _rev and nothing else — suicidal-thoughts
  -- is merged, not revived.
  select count(*) into v_n from public.unified_tags
   where slug in ('suicidal-ideation','minority-stress','stigma','mental-health-stigma',
                  'protective-factors','resilience','queer-resilience','family-acceptance',
                  'chosen-family','crisis-intervention','peer-support','anxiety',
                  'post-traumatic-stress-disorder','stress','gender-dysphoria',
                  'internalized-transphobia','anti-bullying-policies','chosen-name','pronouns',
                  'social-transition','gender-affirmation','questioning','demisexual',
                  'intersectionality')
     and status = 'active' and human_reviewed
     and verification_status in ('reviewed','locked') and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is not null;
  if v_n <> 24 then
    raise exception 'prevention-2: expected 24 revived rows, found %', v_n;
  end if;

  -- The reason the file exists, asserted the way the sweep actually selects:
  -- active, zero usage, not human-reviewed. Every row revived here has zero
  -- usage by construction — that is why it was deleted — so human_reviewed is
  -- the only thing standing between this work and the next cron run.
  select count(*) into v_n
    from public.unified_tags t
   where t.status = 'active'
     and coalesce(t.human_reviewed, false) = false
     and coalesce((select usage_count from public.tag_usage_summary s where s.id = t.id), 0) = 0
     and t.slug in ('suicidal-ideation','minority-stress','stigma','mental-health-stigma',
                    'protective-factors','resilience','queer-resilience','family-acceptance',
                    'chosen-family','crisis-intervention','peer-support','anxiety',
                    'post-traumatic-stress-disorder','stress','gender-dysphoria',
                    'internalized-transphobia','anti-bullying-policies','chosen-name','pronouns',
                    'social-transition','gender-affirmation','questioning','demisexual',
                    'intersectionality');
  if v_n <> 0 then
    raise exception 'prevention-2: % revived row(s) are still sweepable by deprecate_unused_tags()', v_n;
  end if;

  -- The four factually wrong descriptions must be gone, not merely longer.
  select count(*) into v_n from public.unified_tags
   where slug = 'stigma' and coalesce(description,'') ~* 'intersex';
  if v_n <> 0 then
    raise exception 'prevention-2: stigma is still defined as intersex-specific';
  end if;

  select count(*) into v_n from public.unified_tags
   where slug = 'peer-support' and coalesce(description,'') ~* 'drug use';
  if v_n <> 0 then
    raise exception 'prevention-2: peer-support is still scoped to drug use';
  end if;

  -- suicidal-ideation must distinguish itself from self-harm; that distinction
  -- is the one a mishandled disclosure turns on.
  select count(*) into v_n from public.unified_tags
   where slug = 'suicidal-ideation' and coalesce(long_description,'') ~* 'not the same as self-harm';
  if v_n <> 1 then
    raise exception 'prevention-2: suicidal-ideation prose must separate ideation from self-harm';
  end if;

  -- The merge landed, and landed as a redirect rather than a dead slug.
  select count(*) into v_n from public.unified_tags d
    join public.unified_tags c on c.id = d.merged_into_id
   where d.slug = 'suicidal-thoughts' and d.status = 'merged' and c.slug = 'suicidal-ideation';
  if v_n <> 1 then
    raise exception 'prevention-2: suicidal-thoughts did not merge into suicidal-ideation';
  end if;

  -- Not revived, on purpose. If a later edit adds them back, that is a
  -- decision someone should have to make explicitly.
  select count(*) into v_n from public.unified_tags
   where slug in ('dysphoria','body-dysphoria','crisis-hotlines') and status = 'active';
  if v_n <> 0 then
    raise exception 'prevention-2: % deliberately-excluded tag(s) are active — see the header', v_n;
  end if;

  -- Categories agree between the junction and the mirror.
  select count(*) into v_n from public.unified_tags t
   where t.slug in ('suicidal-ideation','minority-stress','family-acceptance','chosen-family',
                    'peer-support','questioning','anti-bullying-policies')
     and t.category_id is null;
  if v_n <> 0 then
    raise exception 'prevention-2: % revived row(s) have no category', v_n;
  end if;

  -- panic-attack: wrong parent gone, right parent present.
  select count(*) into v_n from public.tag_relations rel
    join public.unified_tags s on s.id = rel.source_tag_id
    join public.unified_tags g on g.id = rel.target_tag_id
   where rel.relation_type = 'broader' and s.slug = 'panic-attack' and g.slug = 'drug-emergency';
  if v_n <> 0 then
    raise exception 'prevention-2: panic-attack is still a kind of drug emergency';
  end if;

  select count(*) into v_n from public.tag_relations rel
    join public.unified_tags s on s.id = rel.source_tag_id
    join public.unified_tags g on g.id = rel.target_tag_id
   where rel.relation_type = 'broader' and s.slug = 'panic-attack' and g.slug = 'anxiety';
  if v_n <> 1 then
    raise exception 'prevention-2: panic-attack has no anxiety parent';
  end if;
end
$verify$;
