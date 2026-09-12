-- The first reviewed tranche of inline-glossary-link surface forms.
--
-- `glossary_link_terms` shipped EMPTY by design: a candidate links nothing, and
-- only a human moves a row to 'active'. This is that review, recorded as a
-- migration rather than hand DML so it is reproducible and re-readable.
--
-- HOW EACH ROW WAS JUDGED. Not by the collision count — the rule this repo
-- earned from the alias incident is to READ BACK WHAT THE TERM WOULD LINK,
-- joined to its host, because the count looks fine when the links are wrong.
-- Every activated term below was sampled against real `cities.description`,
-- `venues.description` and `unified_tags.long_description`, and every sampled
-- match was the intended sense. Examples read during review:
--
--   Clothing-Optional -> "a clothing-optional and naturist beach" (Cap Taillat)
--   Intersex          -> "Lesbian, Gay, Bisexual, Transgender, Queer,
--                         Questioning and Intersex" (Rainbow Community Center)
--   Chosen Family     -> "support from chosen family, defined by the person
--                         rather than assumed" (tag:protective-factors)
--   Harm Reduction    -> "Our harm reduction counseling services center queer…"
--                         (The Stonewall Project)
--   Aromantic         -> "…in the same way an aromantic person feels little or
--                         no romantic attraction" (tag:aplatonic)
--
-- The identity terms match overwhelmingly INSIDE other glossary entries, which
-- is the densest and safest corpus for this feature: a definition that mentions
-- a sibling concept should link it.
--
-- FOUR FINDINGS THAT SHAPED THE SET, all measured rather than assumed.
--
-- (1) ORDERING THE QUEUE BY `usage_count` SURFACES THE LEAST LINKABLE TERMS
--     FIRST. A tag is high-usage precisely because it is broad: the head of that
--     ordering is `Queer` (12,549 uses, 248 own-prose hits), `Pride`, `LGBTQ`
--     (726), `Community` (922) — words this platform uses on nearly every page,
--     where a link teaches the reader nothing. The value is in specific jargon,
--     which sits far down that ordering. The seed script's ordering is a
--     tractability device, not a priority.
--
-- (2) THE TAG NAME IS THE WRONG SURFACE FORM FOR THE HYPHENATED COHORT.
--     Measured against own-voice prose, as-written vs de-hyphenated:
--       Gay-Men 0 / 159     Gay-Bar 0 / 84      Outdoor-Seating 0 / 50
--       Human-Rights 1 / 42 Happy-Hour 0 / 32   Social-Justice 0 / 18
--     Prose writes "gay bar", the facet label is "Gay-Bar", and the matcher is
--     exact on the surface form — so a 0 for these means NEVER MATCHES, not
--     safe. They are rejected with that reason so the seed cannot re-offer them
--     under a name that can never fire; re-introducing them needs a
--     hand-authored spaced surface form, which is a separate decision.
--     `Non-Binary` (74 as-written / 0 spaced) and `Clothing-Optional` are the
--     counter-examples that prove this is per-term, not a rule about hyphens.
--
-- (3) A SLUG IN THE GLOSSARY IS NOT NECESSARILY AN ACTIVE TAG. `asexual` and
--     `demisexual` were on the first draft of this list and are DEPRECATED rows
--     — the live concept is `asexuality`. Both are dropped rather than
--     substituted, because picking the substitute is a review of a different
--     term and belongs in its own tranche.
--
-- (4) `transmisogyny` IS ACTIVE BUT `seo_indexable = false` (revived
--     unpublished), so the readable view excludes it and an 'active' row for it
--     would link nothing while reading as coverage. It is left out; it becomes
--     eligible on its own when the page is published.
--
-- Rows that are plausible but currently match NOTHING in our prose
-- (`sapphic`, `abrosexual`, `queer-of-color-critique`, `bi-erasure`) are left as
-- CANDIDATES, not rejected: zero occurrences today is not a defect, and
-- tombstoning them would block them permanently as the corpus grows.
--
-- `men-who-have-sex-with-men` is deliberately NOT inserted at all. It is
-- is_sensitive with verification_status='unverified', so `tag_is_anon_gated`
-- excludes it from the readable view and activating it would trip
-- `glossary_link_signals().adult_or_gated_terms`. Leaving it absent lets it
-- become legitimately eligible if the tag is ever reviewed.

do $seed$
declare
  -- 18 terms, each verified to exist as an ACTIVE, INDEXABLE, non-gated tag with
  -- prose, and each sampled against real body text before activation.
  v_active text[] := array[
    -- venue policy / naturism (16 samples read, all the intended sense)
    'clothing-optional', 'naturist', 'nudist',
    -- identity terms (every sampled match sat inside another glossary entry)
    'intersex', 'aromantic', 'polyamory', 'genderqueer', 'pansexual', 'two-spirit',
    -- community + health vocabulary a reader may genuinely not know
    'chosen-family', 'harm-reduction', 'prep', 'poppers', 'naloxone',
    'methadone', 'buprenorphine',
    -- discrimination vocabulary
    'heteronormativity', 'deadnaming'
  ];
  v_candidate text[] := array['sapphic', 'abrosexual', 'queer-of-color-critique', 'bi-erasure'];
  v_reject jsonb := jsonb_build_object(
    'queer',           'universal on this platform (248 own-prose hits); a link on nearly every page teaches nothing',
    'news-pride',      'universal on this platform (211 own-prose hits)',
    'lgbtq',           'universal on this platform (726 own-prose hits)',
    'community',       'ordinary English (922 own-prose hits)',
    'social',          'ordinary English (361 own-prose hits)',
    'history',         'ordinary English (335 own-prose hits)',
    'identity',        'ordinary English (283 own-prose hits)',
    'health',          'ordinary English (160 own-prose hits)',
    'gay-friendly',    'on the styleguide own avoid list; linking it would endorse a term we tell writers not to use',
    'gay-bar',         'facet label; prose writes "gay bar" (0 as-written vs 84 spaced) so this form can never match',
    'gay-men',         'facet label; prose writes "gay men" (0 vs 159) so this form can never match',
    'outdoor-seating', 'facet label; prose writes "outdoor seating" (0 vs 50) so this form can never match',
    'happy-hour',      'facet label; prose writes "happy hour" (0 vs 32) so this form can never match',
    'human-rights',    'facet label; prose writes "human rights" (1 vs 42) so this form barely matches',
    'social-justice',  'facet label; prose writes "social justice" (0 vs 18) so this form can never match',
    'pride-events',    'facet label; prose writes "pride events" (0 vs 17) so this form can never match',
    'mental-health',   'facet label; prose writes "mental health" (3 vs 35) so this form barely matches'
  );
  v_slug text;
  v_id uuid;
  v_name text;
  v_reason text;
  v_missing text[] := '{}';
  v_live int;
  v_sig jsonb;
begin
  foreach v_slug in array v_active loop
    select id, name into v_id, v_name from unified_tags where slug = v_slug and status = 'active';
    if v_id is null then
      v_missing := v_missing || v_slug;
      continue;
    end if;
    insert into glossary_link_terms (tag_id, surface_form, status, notes, reviewed_at)
    values (v_id, v_name, 'active',
            'First reviewed tranche: sampled against real prose, every match the intended sense.', now())
    on conflict (surface_form_key) do nothing;
  end loop;

  -- SOFT on preconditions, HARD on postconditions: a concurrent session may
  -- legitimately deprecate or rename a tag between authoring and CI, and an
  -- abort then punishes every migration queued behind this one. A missing slug
  -- is reported, not fatal; what IS fatal is reaching an unsafe end state.
  if array_length(v_missing, 1) > 0 then
    raise notice 'glossary link tranche: % slug(s) had no active tag and were skipped: %',
      array_length(v_missing, 1), v_missing;
  end if;

  foreach v_slug in array v_candidate loop
    select id, name into v_id, v_name from unified_tags where slug = v_slug and status = 'active';
    continue when v_id is null;
    insert into glossary_link_terms (tag_id, surface_form, status, notes)
    values (v_id, v_name, 'candidate',
            'Plausible but matches nothing in our own prose today; pending rather than tombstoned.')
    on conflict (surface_form_key) do nothing;
  end loop;

  -- REJECTED rows are tombstones: the unique key on surface_form_key means the
  -- seed pass can never re-propose them, which is the whole reason a refusal is
  -- kept rather than deleted.
  for v_slug, v_reason in select key, value #>> '{}' from jsonb_each(v_reject) loop
    select id, name into v_id, v_name from unified_tags where slug = v_slug and status = 'active';
    continue when v_id is null;
    insert into glossary_link_terms (tag_id, surface_form, status, rejection_reason)
    values (v_id, v_name, 'rejected', v_reason)
    on conflict (surface_form_key) do nothing;
  end loop;

  -- Postconditions, asserted against the real objects rather than restating
  -- their predicates.
  select count(*) into v_live from glossary_link_terms_public;
  if v_live = 0 then
    raise exception 'no term reached the readable view — every activation was filtered by a gate';
  end if;

  v_sig := public.glossary_link_signals();
  if (v_sig->>'adult_or_gated_terms')::int <> 0
     or (v_sig->>'dead_link_terms')::int <> 0
     or (v_sig->>'definitionless_terms')::int <> 0
     or (v_sig->>'short_surface_forms')::int <> 0
     or (v_sig->>'reasonless_rejections')::int <> 0 then
    raise exception 'tranche violates a zero-invariant: %', v_sig;
  end if;

  raise notice 'glossary link terms live in the readable view: %', v_live;
end $seed$;
