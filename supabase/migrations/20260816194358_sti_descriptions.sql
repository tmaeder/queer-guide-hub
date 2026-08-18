-- Plain-language descriptions for the six thin STI tags.
--
-- WHY THIS EXISTS
--
-- `20260816105747_sti_profiles` attached transmission routes, testing windows
-- and prevention to eleven STI tags, and set `human_reviewed = true` on all of
-- them so `deprecate_unused_tags()` could not prune them again. Six of those
-- eleven still carried one-line auto-generated descriptions of 63-82
-- characters, so the flag asserted a review that had never happened — the
-- `human_reviewed is not evidence` trap, applied to our own writes. This
-- migration makes the flag honest for the six.
--
-- The five already carrying real prose (genital-herpes, genital-warts,
-- hepatitis-a, mpox, shigella) are deliberately NOT touched.
--
-- TWO OF THE SIX WERE WRONG BY OMISSION, NOT MERELY THIN
--
--   * hiv: "a viral infection that attacks the immune system and can lead to
--     AIDS" — true of 1995. It omits that effective treatment gives a normal
--     lifespan and an undetectable viral load cannot be transmitted sexually
--     (U=U). On an LGBTQ+ platform, an HIV entry that stops at "leads to AIDS"
--     is a stigma problem, not just a completeness problem — and the site
--     already carries a `u-equals-u` tag the HIV page never mentioned.
--   * hepatitis-c: "often asymptomatic until damage occurs" omits that a short
--     course of modern antivirals now CURES it. That omission discourages the
--     testing it is trying to encourage.
--
-- gonorrhea additionally omitted antibiotic resistance, which is the entire
-- current public-health story for it.
--
-- Each description carries the actionable fact (test / cure / vaccine) rather
-- than stopping at the pathology, because the band rendered directly beneath
-- it answers "how does it spread" and "when do I test" and this line is what a
-- reader sees first. Prose is ours; factual grounding is the Kink Responsibly
-- STI panel (Darklands) cross-checked against standard sexual-health guidance.

set local statement_timeout = '600s';

do $mig$
declare
  r record;
  v_n int;
begin
  perform set_config('app.actor', 'admin:sti-descriptions', true);

  for r in select * from (values
    ('hiv',
     'A virus that weakens the immune system. With effective treatment people with HIV live a normal lifespan and reach an undetectable viral load, at which point the virus cannot be transmitted sexually. Untreated, it progressively damages the immune system and can lead to AIDS.'),

    ('hepatitis-b',
     'A virus that causes acute or chronic liver inflammation. It passes through both sexual contact and blood contact, and is considerably more infectious by those routes than HIV. A safe vaccine exists and is the main protection.'),

    ('hepatitis-c',
     'A virus that damages the liver and spreads mainly through blood-to-blood contact — shared injecting equipment, and fisting or chemsex where blood is involved. It often causes no symptoms for years, and a short course of modern antivirals now cures it completely.'),

    ('chlamydia',
     'The most commonly reported bacterial STI. It frequently causes no symptoms at all, which is why testing rather than watching for symptoms is what finds it, and it can infect the throat and rectum as well as the genitals. Antibiotics cure it; untreated it can cause long-term inflammatory complications, particularly for people with a uterus.'),

    ('gonorrhea',
     'A bacterial infection of the genitals, rectum or throat, often causing a burning sensation or discharge — and often causing nothing noticeable at all, especially in the throat. Antibiotics still treat it effectively, but it is becoming increasingly resistant to them, which is what makes completing treatment and testing after exposure matter.'),

    ('syphilis',
     'A bacterial infection that begins with a painless sore, which is easy to miss and is itself infectious. A rash can follow weeks later. Antibiotics cure it at every stage, but left untreated over years it can cause serious damage to the nervous system, heart and eyes.')
    ) as d(slug, descr) loop

    update public.unified_tags
       set description       = r.descr,
           short_description = split_part(r.descr, '. ', 1) || '.',
           human_reviewed    = true,
           verification_status = 'reviewed',
           last_verified_at  = now(),
           updated_at        = now()
     where slug = r.slug;

    if not found then
      raise exception 'sti descriptions: tag % not found', r.slug;
    end if;
  end loop;

  -- Every tag carrying an STI profile must now have prose worth the
  -- human_reviewed flag it was given. 120 chars is comfortably above the six
  -- one-liners this replaces (63-82) and below the shortest kept row (212).
  select count(*) into v_n
    from public.unified_tags t
    join public.sti_profiles p on p.tag_id = t.id
   where length(coalesce(t.description, '')) < 120;
  if v_n > 0 then
    raise exception 'sti descriptions: % profiled tag(s) still carry a stub description', v_n;
  end if;

  -- The two claims this migration exists to add must actually be present.
  if (select description from public.unified_tags where slug = 'hiv') not ilike '%undetectable%' then
    raise exception 'sti descriptions: the HIV entry does not mention undetectable viral load';
  end if;
  if (select description from public.unified_tags where slug = 'hepatitis-c') not ilike '%cure%' then
    raise exception 'sti descriptions: the hepatitis C entry does not mention that it is curable';
  end if;
end
$mig$;
