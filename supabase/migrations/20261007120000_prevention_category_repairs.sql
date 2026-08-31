-- LGBTQA+ suicide prevention, part 1 of 5: wrong-entity and wrong-category repairs.
--
-- SOURCE FOR THE WHOLE SERIES
--   Strauss, P., Hill, N.T.M., Marion, L., Gilbey, D., Waters, Z., Moore, J.K.,
--   Costanza, M., Lamblin, M., Robinson, J., Lin, A., Perry, Y. (2022). Suicide
--   prevention in LGBTQA+ young people: best practice guidelines for clinical
--   and community service providers. The Kids Research Institute Australia.
--   https://www.thekids.org.au/globalassets/media/documents/projects/lgbtqa-guidelines/lgbtqa-suicide-prevention-guidelines.pdf
--
--   A Delphi consensus study — 115 experts across two panels (52 professionals,
--   63 LGBTQA+ young people with lived experience of suicidal thoughts and/or
--   behaviour), items retained only at >=80% endorsement from BOTH panels.
--   Endorsed by the Australian Professional Association for Trans Health.
--   Not one sentence is copied; it is factual grounding and an attributed
--   tag_sources row (part 5). Same discipline as saferparty in 20260907100000.
--
-- WHAT THE AUDIT AGAINST THAT DOCUMENT FOUND
--   The vocabulary it is written in does not exist here, and it did not fail to
--   be written — it was deleted. On 2026-06-05, 20260605130000 deprecated 4,349
--   tags as "orphan tag (no entity assignments, relations, synonyms, or
--   aliases)" and recurring deprecate_unused_tags() sweeps took 707 more as
--   "auto: zero usage". Between them: suicidal-ideation, suicidal-thoughts,
--   minority-stress, crisis-intervention, family-acceptance, peer-support,
--   resilience, stigma, anxiety, gender-dysphoria, post-traumatic-stress-
--   disorder, internalized-transphobia, chosen-family, chosen-name,
--   protective-factors, and an entire psychology sub-tree.
--
--   THE RULE IS THE FAULT, not the rows. deprecate_unused_tags() prunes
--   usage_count = 0 where human_reviewed = false. For a venue amenity, zero
--   assignments means dead. For an encyclopedia concept it means nobody has
--   written an article about it yet — which is true of every concept in this
--   guideline by construction. All 22 rows checked carry human_reviewed=false;
--   that flag is both why they were taken and the permanent fix (part 2).
--
-- THIS FILE repairs what survived instead. Each item is a category error of
-- KIND, not a matter of taste:
--
--   1. suicide-prevention was filed under `Consent & Negotiation` — the BDSM
--      negotiation category — with a description lifted from Wikipedia and
--      human_reviewed=false, i.e. one sweep away from deletion itself.
--   2. homophobia (459 assignments) was classified as a Mental Health
--      condition. Prejudice is not a psychiatric disorder, and a category page
--      that lists it beside depression and self-harm asserts that it is.
--      NOTE, added on rebase: 20261006140100 (taxonomy v3, PR C) moved this row
--      to `violence-hate` on its own while this work sat unmerged — the same
--      correction, reached by a rule. The line is kept rather than dropped
--      because it is idempotent, it holds the row against a later re-file, and
--      the file's assertion that homophobia is not a Mental Health condition is
--      the thing worth gating. The original target here was `current-affairs`,
--      a v2 leftover PR E deletes; `violence-hate` is the live v3 stop.
--   3. deadnaming and misgendering sat under `Sexual Orientation`. Both are
--      gender concepts; the guideline defines deadnaming under gender
--      affirmation ("referring to a trans person by the name that they used
--      before affirming their gender").
--   4. safe-space sat under `Legal Rights`.
--   5. `acceptance` (2,258 assignments — the highest-usage broken string in the
--      glossary) had the truncated AI stub "refers to the . Let's explore this
--      concept further:" as its entire description.
--
-- NOT DONE HERE, DELIBERATELY
--   * transphobia sits in `Legal Rights` and biphobia in `Sexual Orientation`.
--     Both are arguably misfiled in the same way homophobia was, but neither
--     asserts that prejudice is an illness, which is the specific harm being
--     corrected. Reorganising the prejudice cluster is a taxonomy decision this
--     guideline does not speak to; recorded here rather than done quietly.
--   * `relaxed` is an empty, description-less row in Mental Health and looks
--     like the same junk as lavenderscare-suizid — but it carries 4 live
--     assignments, and deprecating it would push assignment_to_non_active_tag
--     off its hard zero in scripts/tag-hygiene-baseline.json. Left alone.
--   * panic-attack is re-parented in part 2, not here: its correct parent is
--     `anxiety`, which is still deprecated until that file runs.
--
-- MECHANICS (inherited from 20260907100000 / 20261003110100, each rule earned)
--   * one row per statement in a loop — a set-based UPDATE trips SQLSTATE 27000
--     via sync_tag_category_assignment -> unified_tags_recompute_is_adult;
--   * category_id is written per-row alongside tag_category_assignments, so the
--     row does not land in uncategorized_active;
--   * human_reviewed=true is what stops deprecate_unused_tags() taking these
--     rows the way it took the ones part 2 revives;
--   * is_adult is trigger-derived from the Sexuality & Kink subtree. Never set.
--
-- app.actor must not match 'system:%' — log_unified_tag_change() raises when a
-- human_reviewed row is changed by a system actor.

select set_config('app.actor', 'admin:lgbtqa-prevention-1-20260829', true);

do $mig$
declare
  v_tag_id  uuid;
  v_cat_id  uuid;
  v_from_id uuid;
  v_to_id   uuid;
  r         record;
begin
  ---------------------------------------------------------------------------
  -- 1. Re-file. One row per statement.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('suicide-prevention', 'mental-health'),
      ('homophobia',         'violence-hate'  ),
      ('deadnaming',         'gender-identity'),
      ('misgendering',       'gender-identity'),
      ('safe-space',         'safe-spaces')
    ) as v(slug, cat)
  loop
    select id into v_tag_id from public.unified_tags
     where slug = r.slug and status = 'active';
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
  -- 2. suicide-prevention: replace the Wikipedia lift with prose written to
  --    safe-messaging standard, and mark it reviewed so the sweep cannot take
  --    it. The old text asserted "Suicide is often preventable" and then
  --    listed nothing a reader could do; the guideline's actual content is
  --    that the protective side is assessable and buildable, which is what
  --    this says instead.
  ---------------------------------------------------------------------------
  update public.unified_tags set
    description = 'The work of reducing suicide risk — at the level of one person''s circumstances and relationships, and at the level of the services, schools and laws around them. For LGBTQ+ people the elevated risk is driven by stigma, rejection and discrimination rather than by being LGBTQ+, so prevention is largely about changing those conditions.',
    short_description = 'Reducing suicide risk through support, affirming services and changed conditions — not through changing who someone is.',
    long_description = 'Suicide prevention covers everything from how a friend responds to a disclosure to how a health service is set up and what a country''s law says about queer people.

The starting point for LGBTQ+ populations is that the raised risk is not caused by being LGBTQ+. Best-practice guidance is explicit that it follows from stigma, rejection and discrimination, and equally explicit that most LGBTQ+ people are not at risk and should not be treated as though they were. Pathologising someone because of their identity is itself one of the harms.

That makes prevention unusually concrete. Assessment looks at things that can change — a caregiver relationship strained over someone''s identity, bullying, housing lost after coming out, isolation, a history of conversion practices, barriers to gender affirmation — and, with equal weight, at what is already protecting them: an affirming school or workplace, chosen family, connection to community, positive role models, self-acceptance.

Practice built on this looks ordinary rather than dramatic. Ask directly. Treat a disclosure as information, not an emergency to be managed away. Decide collaboratively who else needs to know, because for a queer young person the adults available are not automatically safe ones. Keep the relationship rather than referring the risk elsewhere. Offer services that are competent with queer people, not merely willing.

If you are in danger now, contact a local crisis line — the support page lists them by country.',
    human_reviewed = true,
    verification_status = 'reviewed',
    seo_indexable = true,
    last_verified_at = now(),
    updated_at = now()
  where slug = 'suicide-prevention';

  ---------------------------------------------------------------------------
  -- 3. `acceptance` — 2,258 assignments behind a truncated AI stub. The tag is
  --    used across scraped venue and event content to mean social acceptance
  --    of LGBTQ+ people, so that is what it now says.
  ---------------------------------------------------------------------------
  update public.unified_tags set
    description = 'Being received as you are, without the expectation of changing or explaining yourself. Used here for social acceptance of LGBTQ+ people — in a family, a workplace, a venue or a country — and distinct from mere tolerance, which asks the same person to remain slightly unwelcome.',
    short_description = 'Being received as you are, rather than tolerated.',
    human_reviewed = true,
    verification_status = 'reviewed',
    last_verified_at = now(),
    updated_at = now()
  where slug = 'acceptance';

  ---------------------------------------------------------------------------
  -- 4. lavenderscare-suizid — a scraper hashtag with no description, no
  --    Wikidata, no assignments, no aliases and no relations, sitting in
  --    Mental Health. It is not merged into `suicide` (part 3) because it is
  --    not a synonym for it: it is a fragment of the Lavender Scare hashtag.
  --    Deprecated with a real reason rather than left for the sweep to take
  --    with the auto text.
  ---------------------------------------------------------------------------
  update public.unified_tags u
     set status = 'deprecated',
         deprecated_at = now(),
         deprecation_reason = 'scraper hashtag fragment: no description, no wikidata, no assignments (lgbtqa-prevention audit 2026-08-29)',
         updated_at = now()
   where u.slug = 'lavenderscare-suizid' and u.status = 'active'
     -- Guard, not decoration: deprecating a tag that still carries assignments
     -- pushes assignment_to_non_active_tag off its hard zero in the hygiene
     -- ratchet. Measured at 0 assignments; the guard keeps that true if the
     -- row acquires one between now and CI.
     and not exists (select 1 from public.unified_tag_assignments a where a.tag_id = u.id);

  ---------------------------------------------------------------------------
  -- 5. Ontology: two wrong parents, both asserting something false.
  --
  --    self-harm was narrower-of `trauma`. Self-harm is not a kind of trauma —
  --    it may follow trauma, which is a different relation entirely, and the
  --    broader edge is what TagInterchange renders as the concept ladder.
  --
  --    gender-affirming-surgery was narrower-of `gender-affirming-therapy`.
  --    Surgery is not a kind of therapy in the counselling sense the parent
  --    describes ("Counseling or psychological support..."). Its real parent is
  --    gender-affirming-care, which already holds hormone-therapy.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('self-harm',                'trauma',                   'mental-health'),
      ('gender-affirming-surgery', 'gender-affirming-therapy', 'gender-affirming-care')
    ) as v(child, old_parent, new_parent)
  loop
    select id into v_tag_id  from public.unified_tags where slug = r.child      and status = 'active';
    select id into v_from_id from public.unified_tags where slug = r.old_parent;
    select id into v_to_id   from public.unified_tags where slug = r.new_parent and status = 'active';
    continue when v_tag_id is null or v_to_id is null;

    delete from public.tag_relations
     where source_tag_id = v_tag_id and target_tag_id = v_from_id
       and relation_type = 'broader';

    insert into public.tag_relations
      (source_tag_id, target_tag_id, relation_type, confidence, review_status)
    values (v_tag_id, v_to_id, 'broader', 1.0, 'approved')
    on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
  end loop;
end
$mig$;

do $verify$
declare v_n int; v_cat text; r record;
begin
  -- The category move is the whole point of the file; assert the junction row
  -- and the denormalized mirror agree, since only the mirror is what the
  -- category page and uncategorized_active read.
  for r in
    select v.slug from (values
      ('suicide-prevention'), ('homophobia'), ('deadnaming'), ('misgendering'), ('safe-space')
    ) as v(slug)
  loop
    select count(*) into v_n
      from public.unified_tags t
      join public.tag_categories c  on c.id = t.category_id
      join public.tag_category_assignments ca
        on ca.tag_id = t.id and ca.category_id = c.id and ca.is_primary
     where t.slug = r.slug;
    if v_n <> 1 then
      raise exception 'prevention-1: % has no agreeing primary category (matched %)', r.slug, v_n;
    end if;
  end loop;

  select c.slug into v_cat
    from public.unified_tags t join public.tag_categories c on c.id = t.category_id
   where t.slug = 'suicide-prevention';
  if v_cat is distinct from 'mental-health' then
    raise exception 'prevention-1: suicide-prevention landed in % , expected mental-health', v_cat;
  end if;

  select count(*) into v_n from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where t.slug = 'homophobia' and c.slug = 'mental-health';
  if v_n <> 0 then
    raise exception 'prevention-1: homophobia is still classified as a mental health condition';
  end if;

  -- Reviewed and publicly readable. Without human_reviewed the next
  -- deprecate_unused_tags() run takes suicide-prevention exactly as it took
  -- the vocabulary part 2 revives.
  select count(*) into v_n from public.unified_tags
   where slug in ('suicide-prevention', 'acceptance')
     and status = 'active' and human_reviewed
     and verification_status in ('reviewed', 'locked');
  if v_n <> 2 then
    raise exception 'prevention-1: expected 2 reviewed rows, found %', v_n;
  end if;

  -- The broken stub must be gone, and the replacement must still point a
  -- reader in danger at the crisis page.
  select count(*) into v_n from public.unified_tags
   where slug = 'acceptance' and coalesce(description,'') !~ 'Let’s explore this concept further'
     and coalesce(description,'') !~ 'Let''s explore this concept further';
  if v_n <> 1 then
    raise exception 'prevention-1: acceptance still carries the truncated AI stub';
  end if;

  select count(*) into v_n from public.unified_tags
   where slug = 'suicide-prevention' and coalesce(long_description,'') ~* 'crisis line';
  if v_n <> 1 then
    raise exception 'prevention-1: suicide-prevention prose must route a reader in danger to help';
  end if;

  -- Wrong parents removed AND right parents present — asserting only the
  -- absence would pass on a tag with no parent at all.
  --
  -- Alias `rel`, not `r`: the plpgsql record variable `r` declared above
  -- shadows a SQL alias of the same name, and the failure is a runtime
  -- `record "r" has no field "source_tag_id"` rather than a parse error.
  select count(*) into v_n from public.tag_relations rel
    join public.unified_tags s on s.id = rel.source_tag_id
    join public.unified_tags g on g.id = rel.target_tag_id
   where rel.relation_type = 'broader'
     and (s.slug, g.slug) in (('self-harm','trauma'), ('gender-affirming-surgery','gender-affirming-therapy'));
  if v_n <> 0 then
    raise exception 'prevention-1: % wrong broader edge(s) survive', v_n;
  end if;

  select count(*) into v_n from public.tag_relations rel
    join public.unified_tags s on s.id = rel.source_tag_id
    join public.unified_tags g on g.id = rel.target_tag_id
   where rel.relation_type = 'broader'
     and (s.slug, g.slug) in (('self-harm','mental-health'), ('gender-affirming-surgery','gender-affirming-care'));
  if v_n <> 2 then
    raise exception 'prevention-1: expected 2 repaired broader edges, found %', v_n;
  end if;
end
$verify$;
