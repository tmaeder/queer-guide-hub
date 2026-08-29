-- `doxy-pep` — the one thing the 2026-08-28 health fact-check found missing
-- rather than wrong.
--
-- Doxycycline post-exposure prophylaxis is a current, trial-backed bacterial-STI
-- prevention intervention aimed squarely at this platform's readership, and the
-- glossary had no tag for it at all — not deprecated, not thin: absent. Measured
-- during that audit alongside `lenacapavir`, `cabotegravir` and `gbl`, which are
-- also absent; this is the one with a guideline behind it.
--
-- THE PROSE LEADS WITH THE LIMITS, NOT THE EFFECT SIZE, and that is deliberate.
-- The headline numbers are striking enough to be quoted out of context, and two
-- of the three things a reader most needs are restrictions:
--
--   1. IT DOES NOT GENERALISE TO CISGENDER WOMEN. The trial that produced the
--      headline (Luetkemeyer, NEJM 2023) enrolled men who have sex with men and
--      transgender women. A parallel trial in Kenyan cisgender women (Stewart,
--      NEJM 2023) found NO significant reduction. Publishing the effect size
--      without that is how a prevention tool becomes a false promise for the
--      group it was not shown to help.
--   2. RESISTANCE IS A MEASURED COST, NOT A THEORETICAL ONE. In the trial,
--      tetracycline-resistant N. gonorrhoeae was 38% (5/13) of post-enrolment
--      isolates in the doxycycline arm against 12% (2/16) in standard care, and
--      doxycycline-resistant S. aureus among colonised participants 16% vs 8%.
--      Small denominators, so the text says "more often" rather than reciting
--      percentages that cannot carry that weight.
--
-- The efficacy figures ARE given, per infection, because "reduces STIs" flattens
-- a real difference: chlamydia and syphilis fall by roughly seven-eighths,
-- gonorrhoea by about half — and gonorrhoea is the one with the resistance
-- problem. A reader deciding whether this is for them needs that shape.
--
-- CATEGORY: Sexual Health, filed through tag_category_assignments directly, one
-- row per statement — `sync_tag_category_assignment` (BEFORE UPDATE) writes that
-- table and its AFTER trigger writes back to unified_tags, so a statement
-- touching one unified_tags tuple twice raises 27000. Established avoidance,
-- per 20260907100000.
--
-- `human_reviewed = true` is load-bearing twice, as it is on every tag in this
-- family: `deprecate_unused_tags()` prunes any active tag with zero usage and
-- skips human-reviewed rows, and `enforce_tag_seo_sensitivity_gate()` forces
-- `seo_indexable := false` on a sensitive row that is not human-reviewed.
-- `verification_status='reviewed'` is what lets `unified_tags_public_gated_read`
-- show a sensitive tag to an anonymous reader.
--
-- ALIASES DELIBERATELY EXCLUDE `doxycycline`. That is a live tag of its own (the
-- antibiotic, with its own page), and `tag_alias_reject_shadow()` would refuse
-- the row anyway — but the reason to not want it is editorial: doxy-PEP is a
-- dosing strategy, not the drug, and collapsing the two would send someone
-- reading about Lyme treatment to an STI-prevention page.

select set_config('app.actor', 'admin:doxy-pep-tag-20260829', true);

do $mig$
declare
  v_cat_id  uuid;
  v_tag_id  uuid;
  v_rel_id  uuid;
  a         text;
  v_skipped int := 0;
begin
  select id into strict v_cat_id from public.tag_categories where slug = 'sexual-health';

  insert into public.unified_tags (
    name, slug, entity_kind, status, description, short_description,
    long_description, is_sensitive, sensitive_topics, verification_status,
    human_reviewed, seo_indexable, last_verified_at
  ) values (
    'Doxy-PEP', 'doxy-pep', 'concept', 'active',
    'Doxycycline post-exposure prophylaxis — a single 200 mg dose of doxycycline taken after condomless sex to prevent bacterial STIs. It cuts chlamydia and syphilis sharply and gonorrhoea less so, and is recommended only for men who have sex with men and transgender women who have had a bacterial STI in the past year.',
    'Doxycycline post-exposure prophylaxis — a single 200 mg dose of doxycycline taken after condomless sex to prevent bacterial STIs.',
'Doxy-PEP is a single 200 mg dose of doxycycline taken after condomless sex — ideally within 24 hours and no later than 72 — to stop a bacterial infection establishing itself. It is prevention taken after the fact, in the same shape as HIV PEP, and it works on bacteria only: it does nothing for HIV, herpes, HPV or hepatitis.

In the trial it is named for, among men who have sex with men and transgender women, it cut chlamydia and syphilis by roughly seven-eighths and gonorrhoea by about half. That gap matters, because gonorrhoea is also where the resistance concern sits.

Two limits belong with those numbers rather than after them.

It has not been shown to work for cisgender women. A parallel trial in Kenya found no significant reduction, and the reasons are not settled. Current guidance therefore covers men who have sex with men and transgender women, and specifically those who have had a bacterial STI in the past twelve months — it is not a general-purpose preventive.

And resistance is a measured cost, not a hypothetical one. In the trial, gonorrhoea resistant to tetracyclines was found more often in people taking doxy-PEP than in those who were not, as was doxycycline-resistant Staphylococcus aureus among people carrying it. The numbers involved are small, but the direction is the one that was expected, which is why guidance caps it at 200 mg in any 24 hours and asks for STI testing and a review of whether to continue every three to six months.

It is not a substitute for testing, and it is not a reason to stop using PrEP.',
    true, array['sexual health','sti prevention'], 'reviewed', true, true, now()
  )
  on conflict (slug) do update set
    status              = 'active',
    description         = excluded.description,
    short_description   = excluded.short_description,
    long_description    = excluded.long_description,
    is_sensitive        = true,
    verification_status = 'reviewed',
    human_reviewed      = true,
    seo_indexable       = true,
    merged_into_id      = null,
    deprecated_at       = null,
    deprecation_reason  = null,
    last_verified_at    = now(),
    updated_at          = now();

  select id into strict v_tag_id from public.unified_tags where slug = 'doxy-pep';

  insert into public.tag_category_assignments (tag_id, category_id, is_primary)
  values (v_tag_id, v_cat_id, true)
  on conflict (tag_id, category_id) do update set is_primary = true;

  -- Broader concepts, where they already exist. Never invented: a missing
  -- target is skipped rather than created, so this cannot mint a stub tag.
  foreach a in array array['sti', 'sexual-health'] loop
    select id into v_rel_id from public.unified_tags where slug = a and status = 'active';
    if v_rel_id is not null and v_rel_id <> v_tag_id then
      insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (v_tag_id, v_rel_id, 'broader', 1.0, 'approved')
      on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
    end if;
  end loop;

  -- `doxycycline` is NOT here on purpose — see the header.
  --
  -- Neither is "Doxy PEP": `normalize_tag_slug` turns the space into a hyphen,
  -- so its alias_slug would be `doxy-pep` — this tag's own slug.
  -- `tag_alias_reject_shadow()` would ALLOW that (it excludes the canonical tag
  -- from its shadow check), so it would insert a self-referential alias rather
  -- than fail. Nothing needs it: `DoxyPEP` covers the closed-up spelling and the
  -- display name already carries the hyphen.
  foreach a in array array['DoxyPEP', 'Doxycycline PEP', 'Doxycycline post-exposure prophylaxis'] loop
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    select v_tag_id, a, public.normalize_tag_slug(a), 'synonym', 'approved'
    where not exists (
      select 1 from public.unified_tags u
       where lower(u.slug) = public.normalize_tag_slug(a)
         and u.status = 'active' and u.id <> v_tag_id)
    on conflict (alias_slug) do nothing;

    if exists (select 1 from public.unified_tags u
                where lower(u.slug) = public.normalize_tag_slug(a)
                  and u.status = 'active' and u.id <> v_tag_id) then
      v_skipped := v_skipped + 1;
      raise notice 'alias % skipped: shadows a live tag', a;
    end if;
  end loop;

  -- Citations, through the same channel the rest of the health corpus uses
  -- (`get_tag_reference_links`, 20260907100200): editorial rows, host-labelled
  -- in the "Elsewhere" rail. Not `is_public` — that flag is reserved by CHECK
  -- for legal instruments carrying an official title and jurisdiction.
  insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, fetched_at, verified_at, is_public)
  select v_tag_id, 'editorial', u.url, u.claim, now(), now(), false
    from (values
      ('https://www.nejm.org/doi/full/10.1056/NEJMoa2211934',
       'Luetkemeyer et al., NEJM 2023 — the DoxyPEP trial. 200 mg within 72 hours; per-quarter relative risk in the PrEP cohort: chlamydia 0.12, syphilis 0.13, gonorrhoea 0.45. Also the source for the tetracycline-resistance signal.'),
      ('https://www.nejm.org/doi/10.1056/NEJMoa2304007',
       'Stewart et al., NEJM 2023 — parallel trial in Kenyan cisgender women found no significant reduction. The basis for not generalising the effect.'),
      ('https://www.cdc.gov/mmwr/volumes/73/rr/rr7302a1.htm',
       '2024 guideline: recommended for MSM and transgender women with at least one bacterial STI in the past 12 months; max 200 mg per 24 hours; STI testing and reassessment every 3-6 months.')
    ) as u(url, claim)
   where not exists (
     select 1 from public.tag_sources s where s.tag_id = v_tag_id and s.source_url = u.url);

  if v_skipped > 0 then
    raise notice 'doxy-pep: % alias(es) skipped as shadowing', v_skipped;
  end if;
end
$mig$;

do $verify$
declare v_n int; v_slug text;
begin
  -- Publicly readable, and readable by an ANONYMOUS reader specifically: a
  -- sensitive tag needs verification_status in ('reviewed','locked') to clear
  -- unified_tags_public_gated_read, and human_reviewed to survive both
  -- deprecate_unused_tags and the SEO sensitivity gate.
  select count(*) into v_n from public.unified_tags
   where slug = 'doxy-pep' and status = 'active' and human_reviewed
     and verification_status in ('reviewed','locked') and seo_indexable;
  if v_n <> 1 then
    raise exception 'doxy-pep: tag is not publicly readable (matched % rows)', v_n;
  end if;

  -- The BEFORE triggers rewrite name and slug, so assert we landed where we
  -- meant to rather than trusting the insert.
  select slug into v_slug from public.unified_tags where slug = 'doxy-pep';
  if v_slug is distinct from 'doxy-pep' then
    raise exception 'doxy-pep: slug was rewritten to %', v_slug;
  end if;

  select count(*) into v_n from public.tag_category_assignments ca
    join public.unified_tags t on t.id = ca.tag_id
    join public.tag_categories c on c.id = ca.category_id
   where t.slug = 'doxy-pep' and c.slug = 'sexual-health';
  if v_n <> 1 then
    raise exception 'doxy-pep: not filed under Sexual Health';
  end if;

  -- The two limits are the reason this tag is worth publishing carefully. If a
  -- later edit strips either one, that is a factual regression, not a style
  -- change — so it fails here rather than being noticed by a reader.
  select count(*) into v_n from public.unified_tags
   where slug = 'doxy-pep'
     and coalesce(long_description,'') ~* 'cisgender women'
     and coalesce(long_description,'') ~* 'resistan';
  if v_n <> 1 then
    raise exception 'doxy-pep: prose must state the cisgender-women limit and the resistance cost';
  end if;

  select count(*) into v_n from public.tag_sources
   where tag_id = (select id from public.unified_tags where slug = 'doxy-pep');
  if v_n < 3 then
    raise exception 'doxy-pep: expected 3 citations, found %', v_n;
  end if;
end
$verify$;
