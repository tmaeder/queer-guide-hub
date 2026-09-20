-- Final tranche: clears the review queue. 18 activated, 18 refused, 0 pending.
--
-- Two groups were still outstanding after 20991201100000:
--
--   (a) the 9 rows sitting at status='candidate'
--   (b) the 283 gated pool rows with NO long_description, which the previous
--       pass never measured because its discriminator only scanned bodies
--
-- Both were run through the same measurement (0 hits in cities/countries prose,
-- >=1 hit in other tags' bodies). Group (b) contributed 10 activations; the rest
-- of its shortlist is ordinary vocabulary and is tombstoned below.
--
-- READ BACK before activation: `Anxiety` — 22 of 22 sampled matches are the
-- clinical or emotional sense (sertraline, benzodiazepines, phobias,
-- eating-disorders, coping-mechanisms), with no competing meaning anywhere in
-- this corpus despite being an ordinary word. `Addiction` — 3 of 3 correct
-- (codeine, tobacco, limerence).
--
-- `Trauma` is REFUSED rather than activated, and the reason is specific rather
-- than caution: in a corpus this heavy on clinical vocabulary, "trauma" carries
-- a live physical-injury sense alongside the psychological one — which is the
-- exact defect this tag's own `short_description` once shipped ("Physical harm
-- to living tissue" on a Mental Health entry). A link cannot disambiguate, so
-- the safe answer is not to link it.
--
-- `Rape` and `Dyke` are refused for reasons that are not lexical: the first is
-- crisis-adjacent and needs no definitional link in running prose, the second is
-- a reclaimed slur whose auto-linking is an editorial decision rather than a
-- vocabulary one. Both are recorded so a later pass does not silently re-propose
-- them as oversights.
--
-- Four terms are activated with ZERO current matches (`sapphic`, `abrosexual`,
-- `bi-erasure`, `queer-of-color-critique`). That is deliberate: they are
-- unambiguous jargon, linking nothing today costs nothing, and the alternative
-- is re-reviewing them the first time a body happens to mention one.

do $seed$
declare
  v_active text[] := array[
    -- resolved from status='candidate'
    'dependence','anxiety','addiction','craving',
    'sapphic','abrosexual','bi-erasure','queer-of-color-critique',
    -- from the previously unmeasured no-long_description pool
    'human-sexuality','pronouns','chaser','transgender-studies','ballroom',
    'disability-studies','dark-room','men-only','adults-only','queerness'
  ];
  v_reject jsonb := jsonb_build_object(
    'trauma',     'live physical-injury sense alongside the psychological one in a clinical corpus; a link cannot disambiguate, and that ambiguity is the defect this tag''s own summary once shipped',
    'rape',       'crisis-adjacent; needs no definitional link in running prose',
    'dyke',       'reclaimed slur — auto-linking it is an editorial decision, not a vocabulary one',
    'disabled',   'ordinary English adjective',
    'crew',       'ordinary English noun',
    'workshops',  'ordinary English noun',
    'equity',     'ordinary English noun with a finance sense',
    'amateur',    'ordinary English noun',
    'breakfast',  'ordinary English noun',
    'cabaret',    'ordinary English noun',
    'cougar',     'ordinary English noun (the animal)',
    'butterfly',  'ordinary English noun (the animal)',
    'cafe',       'ordinary English noun',
    'casting',    'ordinary English noun with several senses',
    'judo',       'ordinary English noun',
    'retro',      'ordinary English adjective',
    'unsure',     'ordinary English adjective',
    'fetishist',  'ordinary derivation of an already-linkable concept'
  );
  v_slug text; v_id uuid; v_name text; v_reason text;
  v_missing text[] := '{}'; v_live int; v_pending int; v_sig jsonb;
begin
  foreach v_slug in array v_active loop
    select id, name into v_id, v_name from unified_tags
      where slug = v_slug and status = 'active' and merged_into_id is null;
    if v_id is null then v_missing := v_missing || v_slug; continue; end if;
    -- The 4 resolved candidates already have a row; promote rather than insert.
    update glossary_link_terms
       set status = 'active', reviewed_at = now(),
           notes = 'Final tranche: read back or structurally unambiguous.'
     where tag_id = v_id and status = 'candidate';
    insert into glossary_link_terms (tag_id, surface_form, status, notes, reviewed_at)
    values (v_id, v_name, 'active', 'Final tranche.', now())
    on conflict (surface_form_key) do nothing;
  end loop;

  for v_slug, v_reason in select key, value #>> '{}' from jsonb_each(v_reject) loop
    select id, name into v_id, v_name from unified_tags
      where slug = v_slug and status = 'active' and merged_into_id is null;
    continue when v_id is null;
    update glossary_link_terms
       set status = 'rejected', rejection_reason = v_reason, reviewed_at = now()
     where tag_id = v_id and status = 'candidate';
    insert into glossary_link_terms (tag_id, surface_form, status, rejection_reason)
    values (v_id, v_name, 'rejected', v_reason)
    on conflict (surface_form_key) do nothing;
  end loop;

  -- Soft on preconditions: a sibling session may move a tag between authoring
  -- and CI, and aborting would block every migration queued behind this one.
  if array_length(v_missing, 1) > 0 then
    raise notice 'final tranche: % slug(s) skipped: %', array_length(v_missing, 1), v_missing;
  end if;

  -- Hard on postconditions.
  select count(*) into v_live from glossary_link_terms_public;
  select count(*) into v_pending from glossary_link_terms where status = 'candidate';
  if v_live < 165 then
    raise exception 'expected the readable view to grow, got % rows', v_live;
  end if;
  if v_pending <> 0 then
    raise exception 'the review queue should be empty, % rows still candidate', v_pending;
  end if;

  v_sig := public.glossary_link_signals();
  if (v_sig->>'adult_or_gated_terms')::int <> 0
     or (v_sig->>'dead_link_terms')::int <> 0
     or (v_sig->>'definitionless_terms')::int <> 0
     or (v_sig->>'short_surface_forms')::int <> 0
     or (v_sig->>'reasonless_rejections')::int <> 0 then
    raise exception 'final tranche violates a zero-invariant: %', v_sig;
  end if;

  raise notice 'glossary link vocabulary: % live, % pending', v_live, v_pending;
end $seed$;
