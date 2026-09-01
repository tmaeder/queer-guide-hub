-- LGBTQA+ suicide prevention, part 4 of 5: route the crisis-adjacent pages to /help.
--
-- Source and rationale: see the header of 20261007120000.
--
-- THE DEFECT THIS FIXES IS THAT NOTHING CONNECTED. TagSafetyCallout
-- (src/components/tags/TagSafetyCallout.tsx) is the ONLY link from any tag page
-- to /help, and it renders on exactly one condition: `is_sensitive`. Measured
-- before this file: self-harm, depression, trauma, eating-disorders, loneliness,
-- panic-attack and suicide-prevention are all is_sensitive = false. Not one
-- mental-health tag page offered a route to support. The 25 crisis lines seeded
-- at /help by 20260411120000 were unreachable from every page a reader in
-- distress would actually land on, while 479 substance and kink tags carried
-- the callout.
--
-- `sensitive_topics` had the matching gap: 27 distinct values in use, all of
-- them adult-content, substance or legal-risk terms, and not one of `suicide`,
-- `self-harm` or `mental health`. The column is a plain text[] with no CHECK,
-- so adding values needs no constraint change, and TagSafetyCallout humanizes
-- them for display (hyphens to spaces).
--
-- WHERE THE LINE IS DRAWN, and why it is not simply "everything in Mental
-- Health". A content note that appears on every page in a category stops being
-- a signal and becomes furniture, and it also pathologises its subject. Two
-- groups get the callout:
--
--   1. The entry is ABOUT self-directed harm or acute crisis — suicide,
--      suicidal-ideation, exposure-to-suicide, safety-planning,
--      suicide-prevention, crisis-intervention, self-harm.
--   2. The entry is a condition with a direct, well-evidenced link to suicide
--      mortality, i.e. where a reader may be reading about themselves while
--      unwell — depression, eating-disorders (the highest mortality of any
--      psychiatric diagnosis, a substantial share of it suicide), and
--      body-image, which the guideline names as a risk factor and which is
--      where a reader in distress about their body arrives.
--
--   Plus conversion-therapy, which is already sensitive for its own reasons and
--   only gains the mental-health topic here.
--
-- DELIBERATELY NOT SENSITIVE, and this is the substantive half of the decision:
--   * mental-health, therapy, psychotherapy, counseling, peer-support,
--     resilience, queer-resilience, protective-factors, chosen-family,
--     family-acceptance, social-support. These are the things the guideline
--     asks services to BUILD. Putting a content warning on ordinary care-seeking
--     and on protective factors tells a reader that looking for help is itself
--     a distressing subject, which is the opposite of the intended effect.
--   * anxiety, trauma, post-traumatic-stress-disorder, loneliness,
--     gender-dysphoria, panic-attack, minority-stress. Real risk factors, but
--     the line above is proximity to suicide mortality, not distress in general
--     — and drawing it at "any difficult subject" is how the callout becomes
--     wallpaper.
--
-- MECHANICS. is_sensitive, human_reviewed and verification_status are written
-- in the SAME statement, always. Setting is_sensitive alone on a row that is not
-- human_reviewed makes enforce_tag_seo_sensitivity_gate() force
-- seo_indexable := false, and leaves unified_tags_public_gated_read hiding the
-- row from anonymous readers unless verification_status is 'reviewed' or
-- 'locked'. Splitting them would therefore DELETE these pages from public view
-- and from the sitemap — on `depression`, which carries 26 assignments, and on
-- `mental-health` had it been included. One statement per row, as ever
-- (SQLSTATE 27000).
--
-- sensitive_topics is UNIONED, not overwritten: conversion-therapy already
-- carries 'conversion therapy' and must keep it.

select set_config('app.actor', 'admin:lgbtqa-prevention-4-20260829', true);

do $mig$
declare
  r        record;
  v_tag_id uuid;
begin
  for r in
    select * from (values
      -- group 1: about self-directed harm or acute crisis
      ('suicide',             array['suicide']),
      ('suicidal-ideation',   array['suicide']),
      ('exposure-to-suicide', array['suicide']),
      ('safety-planning',     array['suicide']),
      ('suicide-prevention',  array['suicide']),
      ('crisis-intervention', array['suicide','mental health']),
      ('self-harm',           array['self-harm']),
      -- group 2: conditions with a direct link to suicide mortality
      ('depression',          array['mental health']),
      ('eating-disorders',    array['mental health']),
      ('body-image',          array['mental health']),
      -- already sensitive; gains the topic only
      ('conversion-therapy',  array['mental health'])
    ) as v(slug, topics)
  loop
    select id into v_tag_id from public.unified_tags
     where slug = r.slug and status = 'active';
    if v_tag_id is null then
      raise notice 'prevention-4: % not active, skipped', r.slug;
      continue;
    end if;

    -- All four flags together. See the header: splitting this statement
    -- deindexes the page and hides it from anonymous readers.
    update public.unified_tags u set
      is_sensitive        = true,
      sensitive_topics    = (
        select array_agg(distinct x order by x)
          from unnest(coalesce(u.sensitive_topics, '{}'::text[]) || r.topics) x
         where x is not null and btrim(x) <> ''
      ),
      human_reviewed      = true,
      verification_status = 'reviewed',
      seo_indexable       = true,
      last_verified_at    = now(),
      updated_at          = now()
    where u.id = v_tag_id;
  end loop;
end
$mig$;

do $verify$
declare v_n int; r record;
begin
  -- Every intended page carries the callout AND survives the sensitivity gate.
  -- The three flags are asserted together because that is how they fail.
  select count(*) into v_n from public.unified_tags
   where slug in ('suicide','suicidal-ideation','exposure-to-suicide','safety-planning',
                  'suicide-prevention','crisis-intervention','self-harm','depression',
                  'eating-disorders','body-image','conversion-therapy')
     and status = 'active'
     and is_sensitive
     and human_reviewed
     and verification_status in ('reviewed','locked')
     and seo_indexable
     and coalesce(array_length(sensitive_topics, 1), 0) > 0;
  if v_n <> 11 then
    raise exception 'prevention-4: expected 11 sensitive routed rows, found %', v_n;
  end if;

  -- The gate that would have silently deleted these pages from public view.
  -- Asserted as its own check so the failure names the cause.
  select count(*) into v_n from public.unified_tags
   where is_sensitive and status = 'active'
     and slug in ('suicide','suicidal-ideation','self-harm','depression','suicide-prevention')
     and (not seo_indexable or verification_status not in ('reviewed','locked'));
  if v_n <> 0 then
    raise exception 'prevention-4: % crisis page(s) are hidden from anonymous readers or deindexed', v_n;
  end if;

  -- conversion-therapy kept the topic it already had.
  select count(*) into v_n from public.unified_tags
   where slug = 'conversion-therapy' and 'conversion therapy' = any(sensitive_topics);
  if v_n <> 1 then
    raise exception 'prevention-4: conversion-therapy lost its original sensitive topic';
  end if;

  -- The new vocabulary actually landed in the column TagSafetyCallout reads.
  for r in select unnest(array['suicide','self-harm','mental health']) as topic loop
    select count(*) into v_n from public.unified_tags
     where status = 'active' and r.topic = any(sensitive_topics);
    if v_n = 0 then
      raise exception 'prevention-4: no active tag carries the sensitive topic %', r.topic;
    end if;
  end loop;

  -- The negative half of the policy. If a later change marks care-seeking and
  -- protective factors as sensitive, the callout becomes furniture and the
  -- glossary starts telling readers that looking for help is distressing.
  select count(*) into v_n from public.unified_tags
   where status = 'active' and is_sensitive
     and slug in ('mental-health','therapy','psychotherapy','counseling','peer-support',
                  'resilience','queer-resilience','protective-factors','chosen-family',
                  'family-acceptance','social-support');
  if v_n <> 0 then
    raise exception 'prevention-4: % support/protective tag(s) were marked sensitive — see the header', v_n;
  end if;
end
$verify$;
