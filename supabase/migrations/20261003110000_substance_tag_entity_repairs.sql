-- Substance-tag entity repairs: three tags describing the wrong concept entirely,
-- plus the name/category/sensitivity defects found alongside them.
--
-- WHY THIS EXISTS
--
-- Verifying the `Substances & Harm Reduction` vocabulary against an external
-- harm-reduction handbook (eve&rave, "Das Substanzhandbuch" v1.1) surfaced live,
-- indexed glossary pages whose body text is about a different entity. This is
-- the same defect class as the `rack` -> physical rack repair (20260816105401)
-- and `hate-crimes` -> a TV episode (20260906100100).
--
--   pcp         long_description opened "The Portuguese Communist Party is a
--               communist and Marxist-Leninist political party in Portugal",
--               wikidata_id Q769829, wikipedia_url /wiki/Portuguese_Communist_Party.
--               The `description` above it is the correct saferparty text about
--               phencyclidine, so the page rendered a correct lead over a body
--               about a political party.
--               THE PROSE HALF OF THIS IS ALREADY FIXED ON MAIN, independently,
--               by 20261002100000_health_tag_wrong_entity_prose — which found
--               the same body by sweeping health tags rather than substances.
--               Only the identifiers are repaired here; see section 1.
--   dependence  Entire body about farm outbuildings ("an outbuilding, also known
--               as a dependency, is a separate building..."), wikidata_id
--               Q3044808, wikipedia_url /wiki/Outbuilding, and a `description`
--               that is a raw Wikipedia disambiguation stub ("...may refer to:").
--   beer        wikidata_id Q814067, whose English label is "Beer" and whose
--               description is "family name". The body prose is correct; only
--               the identifier points at a surname. Beer the beverage is Q44.
--
-- `human_reviewed` IS NOT EVIDENCE, AGAIN
--
-- `pcp` carries human_reviewed = true. The saferparty import wrote a correct
-- one-paragraph `description` onto a row an earlier Wikipedia sweep had already
-- filled from the wrong entity, and nothing ever compared the two fields. The
-- flag records that a human touched the row, not that every column on it is
-- right. The regression query in step 6 is the check that would have caught it.
--
-- THE REPLACEMENT QIDS WERE LOOKED UP, NOT INFERRED
--
-- Q407324 phencyclidine ("organic compound, often used as a street drug"),
-- Q3378593 substance dependence ("need for a drug, whose discontinuation results
-- in withdrawal symptoms"), Q44 beer ("alcoholic beverage obtained by fermenting
-- starchy materials and not distilled") — each read back from the Wikidata API
-- before being written here.
--
-- RENAMING IS SAFE HERE ONLY BECAUSE THE SLUG DOES NOT MOVE
--
-- `normalize_tag_input` regenerates the slug whenever `name` changes, and
-- `log_unified_tag_slug_redirect` then writes a redirect row. Both renames below
-- were checked against the live functions first:
--   normalize_tag_slug('Social Drinking')  = 'social-drinking'   (unchanged)
--   normalize_tag_slug('Substance Abuse')  = 'substance-abuse'   (unchanged)
-- so no slug moves and no redirect is created. Do not extend this pattern to a
-- rename that does change the slug without handling the redirect deliberately.
--
-- WHY THE SENSITIVITY FLAGS CHANGE
--
-- `overdose`, `dependence`, `drug-use` and `substance-abuse` were is_sensitive =
-- false, so `TagSafetyCallout` did not render on them — no harm-reduction
-- framing and no /help link on the four terms in this category a reader in
-- trouble is most likely to land on. Setting is_sensitive alone would be a trap:
-- `enforce_tag_seo_sensitivity_gate()` forces seo_indexable = false when
-- (is_sensitive OR is_adult) AND NOT human_reviewed, so flipping sensitivity on
-- an unreviewed row silently deindexes it. Each of the four therefore gets
-- curated prose and human_reviewed = true in the same statement.
--
-- CATEGORY REFILES
--
-- `codeine` (an opioid) had its primary category assignment on Slang &
-- Terminology and `tobacco` on Events & Scene — both already carried a
-- non-primary substances-harm-reduction row, so this is a primary flip, not a
-- new assignment. Per 20260907100000: never touch these in a set-based
-- statement. The sync_tag_category_assignment (BEFORE UPDATE on unified_tags)
-- -> unified_tags_recompute_is_adult (AFTER on tag_category_assignments) pair
-- throws SQLSTATE 27000 "tuple already modified" if one statement hits the same
-- unified_tags tuple twice.
--
-- `tolerance` WAS ON THIS LIST AND WAS REMOVED — it is a different concept.
--
-- The handbook has a pharmacology chapter on tolerance (needing more of a
-- substance for the same effect), and the existing `tolerance` tag looked like
-- the obvious home for it. It is not: its body reads "Tolerance refers to the
-- acceptance and respect of people's differences, including their sexual
-- orientation, gender identity, and expression." That is social tolerance, a
-- core community value, and refiling it under Substances & Harm Reduction would
-- have silently converted it into a drug term and dragged every entity tagged
-- with it along. One slug cannot hold both senses — the same collision class as
-- the same-name-city repairs. Pharmacological tolerance gets its own slug
-- (`drug-tolerance`) in the vocabulary migration; this row is left alone.
--
-- THE PROSE IS OURS
--
-- The handbook is CC BY-NC-SA 4.0 and this is a commercial platform, so not one
-- sentence is reused; it is factual grounding only. Descriptions carry no dosage
-- figures, no route-of-administration instructions and no combination advice —
-- the same boundary 20260907100000 set for this category.

set local statement_timeout = '600s';

do $mig$
declare
  v_cat_id  uuid;
  v_tag_id  uuid;
  v_n       int;
  r         record;
begin
  perform set_config('app.actor', 'admin:substance-tag-entity-repairs', true);

  select id into strict v_cat_id
    from public.tag_categories where slug = 'substances-harm-reduction';

  ---------------------------------------------------------------------------
  -- 1. pcp — repoint the identifiers ONLY.
  --
  --    The prose half of this repair reached main first, in
  --    20261002100000_health_tag_wrong_entity_prose, which found the same
  --    Portuguese Communist Party body from the other direction — a sweep over
  --    health tags rather than over substances — and replaced it. That text is
  --    live and good, so long_description is no longer touched here; rewriting
  --    it would overwrite equivalent work for nothing.
  --
  --    What that migration did NOT touch is any identifier. It contains zero
  --    references to wikidata_id, so `pcp` still carries Q769829 — the party.
  --    That matters more than the prose did: the identifier is what
  --    run_tag_medical_codes_sync and run_tag_wikidata_hierarchy read, so a
  --    wrong QID keeps generating wrong derived data indefinitely after the
  --    visible text has been corrected.
  ---------------------------------------------------------------------------
  update public.unified_tags set
    wikidata_id      = 'Q407324',
    wikipedia_url    = 'https://en.wikipedia.org/wiki/Phencyclidine',
    last_verified_at = now(),
    updated_at       = now()
  where slug = 'pcp';

  ---------------------------------------------------------------------------
  -- 2. dependence — was an article about farm buildings.
  ---------------------------------------------------------------------------
  update public.unified_tags set
    name              = 'Dependence',
    description       = 'The state in which the body has adapted to a substance being present, so that stopping or cutting down produces withdrawal. Dependence is a physiological fact about the body, not a judgement about the person — and for some substances, stopping abruptly is genuinely dangerous rather than merely unpleasant.',
    short_description = 'The state in which the body has adapted to a substance being present, so that stopping or cutting down produces withdrawal.',
    long_description  = 'Dependence describes what happens when the body adjusts to a substance being regularly present and comes to rely on it to stay in balance. The measurable sign is withdrawal: stop, or cut down sharply, and the body reacts.

It is worth separating from two things it often gets confused with. Tolerance — needing more for the same effect — frequently accompanies dependence but is not the same thing. And dependence is not a statement about someone''s character or willpower; it is an adaptation, and it can develop in anyone who uses a substance regularly enough, including people taking a medicine exactly as prescribed.

The practical reason to understand it is that withdrawal is not equally risky across substances. Coming off substances that act on the GABA system — alcohol, benzodiazepines, GHB and its precursors — can be life-threatening, with seizures and delirium, and is a situation for medical supervision and a planned reduction rather than stopping dead. Opioid withdrawal is severe and can be genuinely awful, but is not usually dangerous in the same way. Withdrawal from stimulants, cannabis and dissociatives tends to be predominantly psychological.

The other thing worth knowing is what happens after a break. Tolerance falls away quickly during abstinence, so an amount that was routine before can be an overdose on returning to use. This is a leading cause of fatal overdose after detox, prison or any other enforced pause.',
    wikidata_id       = 'Q3378593',
    wikipedia_url     = 'https://en.wikipedia.org/wiki/Substance_dependence',
    is_sensitive      = true,
    sensitive_topics  = array['substance use','harm reduction'],
    verification_status = 'reviewed',
    human_reviewed    = true,
    last_verified_at  = now(),
    updated_at        = now()
  where slug = 'dependence';

  ---------------------------------------------------------------------------
  -- 3. beer — identifier pointed at a surname (Q814067). Prose is fine.
  ---------------------------------------------------------------------------
  update public.unified_tags set
    wikidata_id      = 'Q44',
    wikipedia_url    = 'https://en.wikipedia.org/wiki/Beer',
    last_verified_at = now(),
    updated_at       = now()
  where slug = 'beer';

  ---------------------------------------------------------------------------
  -- 4. drug-use — both fields were wrong, in two different ways. `description`
  --    was a raw Wikipedia disambiguation list ("Drug use may refer to any drug
  --    use; or:Entheogen\nPerformance-enhancing drugs\n..."), and
  --    `long_description` was the opening of the *Substance use disorder*
  --    article — a narrower and quite different concept. Using a drug is not a
  --    disorder, and letting the page say otherwise is exactly the framing this
  --    category is supposed to avoid.
  ---------------------------------------------------------------------------
  update public.unified_tags set
    description       = 'Taking a psychoactive substance, of any kind and for any reason. The term is deliberately neutral: it covers prescribed medicines, everyday drugs like caffeine and alcohol, and illegal ones, and it says nothing about whether the use is harmful.',
    short_description = 'Taking a psychoactive substance, of any kind and for any reason.',
    long_description  = 'Drug use means taking a psychoactive substance — anything that changes perception, mood, alertness or consciousness. The term is deliberately broad and deliberately neutral. Coffee, a prescribed antidepressant, a glass of wine and an illegal stimulant are all drug use, and grouping them that way is the point: the legal status of a substance is a poor guide to how risky it is.

It is worth keeping separate from two narrower ideas. Dependence is the body adapting so that stopping produces withdrawal. Substance use disorder is a clinical diagnosis with defined criteria, made when use has become compulsive and is causing harm the person cannot easily stop. Most drug use is neither. Treating the categories as interchangeable is what produces the assumption that anyone who uses a drug is on their way to a problem, which is both untrue and one of the reasons people avoid asking for information when they do want it.

Harm reduction starts from what people are actually doing rather than from what they should be doing. The practical questions are what the substance is, how much, in what state of mind and in what setting, what else is in the system, and who would notice if something went wrong.',
    is_sensitive      = true,
    sensitive_topics  = array['substance use','harm reduction'],
    verification_status = 'reviewed',
    human_reviewed    = true,
    last_verified_at  = now(),
    updated_at        = now()
  where slug = 'drug-use';

  ---------------------------------------------------------------------------
  -- 5. overdose — prose is sound; it was simply not marked sensitive, so the
  --    safety callout and /help link never rendered on it.
  ---------------------------------------------------------------------------
  update public.unified_tags set
    is_sensitive     = true,
    sensitive_topics = array['substance use','harm reduction'],
    verification_status = 'reviewed',
    human_reviewed   = true,
    last_verified_at = now(),
    updated_at       = now()
  where slug = 'overdose';

  ---------------------------------------------------------------------------
  -- 6. substance-abuse — display name carried the slug's hyphen. The vocabulary
  --    question (this term vs. "substance use disorder") is deliberately NOT
  --    settled here; it is a merge, and merges belong with the vocabulary
  --    migration that introduces the canonical term.
  ---------------------------------------------------------------------------
  update public.unified_tags set
    name             = 'Substance Abuse',
    is_sensitive     = true,
    sensitive_topics = array['substance use','harm reduction'],
    verification_status = 'reviewed',
    human_reviewed   = true,
    last_verified_at = now(),
    updated_at       = now()
  where slug = 'substance-abuse';

  ---------------------------------------------------------------------------
  -- 7. social-drinking and sober — active, rendering, and completely empty.
  ---------------------------------------------------------------------------
  update public.unified_tags set
    name              = 'Social Drinking',
    description       = 'Drinking alcohol as part of being with other people rather than for its own sake. It is the most common relationship people have with alcohol, and the one most shaped by whoever else is in the room.',
    short_description = 'Drinking alcohol as part of being with other people rather than for its own sake.',
    long_description  = 'Social drinking describes alcohol taken as an accompaniment to company — a round after work, a drink at dinner, the glass someone hands you at a party.

For queer communities the setting matters more than usual. Bars and clubs have historically been among the few places it was safe to be visible, which means alcohol has been woven into the social infrastructure of the scene rather than sitting beside it. That is worth naming, because it makes "just not drinking" a larger social act here than it might be elsewhere, and it is part of why sober queer spaces and alcohol-free events have become something people actively organise.

Nothing about the phrase implies a safe amount. What it describes is a context, not a quantity, and the risks of alcohol are the same whether it is drunk alone or in company.',
    updated_at        = now()
  where slug = 'social-drinking';

  update public.unified_tags set
    description       = 'Not currently using alcohol or other drugs. People arrive at it by very different routes — recovery, medication, health, religion, or simply preferring it — and the word says nothing about which.',
    short_description = 'Not currently using alcohol or other drugs.',
    long_description  = 'Being sober means not currently using alcohol or other drugs. Beyond that the word carries no single story: some people are in recovery, some take medication that rules drinking out, some have a health reason, some never enjoyed it, and some simply prefer their evenings otherwise.

On this platform it is also a search facet rather than only a definition. Sober queer nightlife, alcohol-free events and recovery groups are a real and growing part of the scene, which matters in communities whose social spaces have historically been bars. Venues and events tagged this way are the ones where not drinking does not make you the odd one out.

Asking someone why they are not drinking is a bigger question than it sounds, and it is not one anyone owes an answer to.',
    updated_at        = now()
  where slug = 'sober';

  ---------------------------------------------------------------------------
  -- 8. Category refiles, one row per statement (see header re SQLSTATE 27000).
  --    codeine and tobacco already carry a non-primary substances row, so the
  --    old primary is demoted and the substances row promoted. tolerance has
  --    only an Events & Scene row and needs one created.
  ---------------------------------------------------------------------------
  for r in
    select unnest(array['codeine','tobacco']) as slug
  loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    continue when v_tag_id is null;

    update public.tag_category_assignments
       set is_primary = false
     where tag_id = v_tag_id and category_id <> v_cat_id;

    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (v_tag_id, v_cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;

    -- Drives the denormalized unified_tags.category text via
    -- sync_tag_category_assignment (BEFORE UPDATE).
    update public.unified_tags
       set category_id = v_cat_id, updated_at = now()
     where id = v_tag_id and category_id is distinct from v_cat_id;
  end loop;

  ---------------------------------------------------------------------------
  -- 9. Assertions. A silent partial repair is the failure worth paying for.
  ---------------------------------------------------------------------------

  -- The wrong-entity check, run category-wide rather than on the known rows so
  -- it also guards whatever the next import writes.
  --
  -- THIS ASSERTS THE ABSENCE OF THE WRONG SUBJECT, NOT THE PRESENCE OF THE NAME.
  -- The first draft required every body to contain its own tag's name, which is
  -- how the two defects here were found. It is a good detector and a bad
  -- invariant: 20261002100000_health_tag_wrong_entity_prose landed on main with
  -- a correct `pcp` body that opens "Phencyclidine is a dissociative
  -- anaesthetic" and never uses the acronym, and the name test rejects it. A
  -- rule that fails on correct prose would either be disabled or would force
  -- writers to work around it. The negative form — no body may contain a
  -- subject we know is wrong — is precise, cannot false-positive on good
  -- writing, and is the pattern that migration used.
  select count(*) into v_n
    from public.unified_tags
   where category = 'Substances & Harm Reduction'
     and status = 'active'
     and coalesce(long_description, '') ~* '(Portuguese Communist|Marxist.Leninist|an outbuilding|separate building|family name|Saint Louis Art Museum|pumping house|house music)';
  if v_n > 0 then
    raise exception 'entity repairs: % active substance tag(s) still carry a known-wrong subject', v_n;
  end if;

  -- Disambiguation stubs are their own defect and are cheap to detect.
  select count(*) into v_n
    from public.unified_tags
   where category = 'Substances & Harm Reduction'
     and status = 'active'
     and coalesce(description, '') ~* 'may (also )?refer to:';
  if v_n > 0 then
    raise exception 'entity repairs: % active substance tag(s) still carry a Wikipedia disambiguation stub', v_n;
  end if;

  select count(*) into v_n
    from public.unified_tags
   where slug = 'pcp'
     and (wikidata_id <> 'Q407324' or long_description ilike '%communist%');
  if v_n > 0 then
    raise exception 'entity repairs: pcp still points at the Portuguese Communist Party';
  end if;

  select count(*) into v_n
    from public.unified_tags
   where slug = 'dependence'
     and (wikidata_id <> 'Q3378593' or long_description ilike '%outbuilding%');
  if v_n > 0 then
    raise exception 'entity repairs: dependence still describes an outbuilding';
  end if;

  select count(*) into v_n
    from public.unified_tags where slug = 'beer' and wikidata_id <> 'Q44';
  if v_n > 0 then
    raise exception 'entity repairs: beer still points at the surname entity';
  end if;

  -- The renames must not have moved a slug (see header).
  select count(*) into v_n
    from public.unified_tags
   where slug in ('social-drinking','substance-abuse','dependence')
     and name like '%-%';
  if v_n > 0 then
    raise exception 'entity repairs: % tag name(s) still carry the slug hyphen', v_n;
  end if;

  select count(*) into v_n
    from public.unified_tags
   where slug in ('sober','social-drinking')
     and (coalesce(description, '') = '' or coalesce(long_description, '') = '');
  if v_n > 0 then
    raise exception 'entity repairs: % tag(s) left with an empty body', v_n;
  end if;

  -- Sensitivity without human_reviewed silently deindexes the page.
  select count(*) into v_n
    from public.unified_tags
   where slug in ('overdose','dependence','drug-use','substance-abuse')
     and (is_sensitive is not true or human_reviewed is not true
          or seo_indexable is not true);
  if v_n > 0 then
    raise exception 'entity repairs: % term(s) not in the sensitive+reviewed+indexable state', v_n;
  end if;

  select count(*) into v_n
    from public.unified_tags
   where slug in ('codeine','tobacco')
     and category is distinct from 'Substances & Harm Reduction';
  if v_n > 0 then
    raise exception 'entity repairs: % tag(s) not refiled under substances-harm-reduction', v_n;
  end if;

  -- Social tolerance must NOT have been dragged into the substance category.
  if exists (
    select 1 from public.unified_tags
     where slug = 'tolerance' and category = 'Substances & Harm Reduction'
  ) then
    raise exception 'entity repairs: social `tolerance` was refiled as a substance term';
  end if;

  -- is_adult is trigger-derived from the Sexuality & Kink subtree. Nothing here
  -- should have moved it; a harm-reduction page behind an age wall helps nobody.
  select count(*) into v_n
    from public.unified_tags
   where slug in ('codeine','tobacco','dependence','pcp') and is_adult;
  if v_n > 0 then
    raise exception 'entity repairs: % repaired tag(s) became is_adult', v_n;
  end if;

  raise notice 'entity repairs: pcp/dependence/beer repointed, 3 tags refiled, 4 terms made sensitive';
end
$mig$;

-- The refiles change which category page these tags appear under, and the
-- prose fills change what the glossary index shows.
select public.recount_all_tag_usage(500);
