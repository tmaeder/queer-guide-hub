-- Second reviewed tranche: 135 terms activated, 34 refused.
--
-- Tranche 1 (20650101100000) activated 18 and recorded that ordering the review
-- queue by `usage_count` surfaces the LEAST linkable terms first. This pass uses
-- a better discriminator, measured over the whole remaining pool of 1,130
-- gated candidates carrying a `long_description`:
--
--     ordinary_hits  = occurrences in cities + countries descriptions
--     glossary_hits  = occurrences in OTHER tags' long_description
--     shortlist      = ordinary_hits = 0 AND glossary_hits >= 1
--
-- The idea is that an ORDINARY ENGLISH WORD turns up in travel copy about cities,
-- while JARGON only turns up where the subject is discussed. It works: the
-- shortlist is dense with pharmacology, clinical and identity vocabulary
-- (`Benzodiazepines`, `Phalloplasty`, `Cisgender`, `Homonationalism`) and the
-- ordinary words it does admit are obvious on sight and refused below.
--
-- THE RULE APPLIED PER ROW, stated so the next pass is consistent with this one:
-- activate when the term is (a) technical or clinical, (b) a named concept,
-- movement or procedure, or (c) community jargon. Refuse when it is an ordinary
-- English word, or a term in general public use whose definition a typical reader
-- would not need. That second clause is why `cisgender`, `transphobia` and
-- `patriarchy` are in and `transgender`, `homophobia`, `racism` and `violence`
-- are not — not because the latter matter less, but because a link on them
-- teaches nothing and spends the per-document budget.
--
-- THREE TERMS WERE REFUSED ON MEASURED EVIDENCE, not on a hunch. Each was
-- sampled against real glossary bodies first:
--
--   AIDS      The matcher is case-insensitive, so it also hits the ordinary
--             plural. Live examples: "coordinated leg, seat, and rein aids"
--             (tag:training), "latex garments need dressing aids"
--             (tag:latex-clothing), "mobility aids such as leg braces"
--             (tag:abasiophilia). Three false positives in one sample of a
--             health acronym is disqualifying.
--   Binding   The tag is chest binding (Trans Health). NOT ONE sampled match was
--             that sense: rope bondage (bakushi, spreader-bar, genitorture,
--             anaconda), receptor chemistry ("binding to and activating the
--             androgen receptor"), and contract law ("legally binding on the
--             parties"). The wrong-sense class, exactly.
--   Chastity  Splits between the kink device (chastity-cage, key-holder) and
--             religious vows — "vows of poverty, chastity, and obedience" on
--             tag:nun and tag:sister. Linking those to a device page is wrong.
--
-- Terms read back in full before activation: Consent (all correct), Cisgender
-- (20/20 correct), Comedown (4/4), Agonist and Antagonist (pharmacology only).
-- The remaining activations rest on the STRUCTURAL argument above — a drug name
-- or a surgical procedure has no competing sense in this corpus — rather than on
-- a per-row reading, and that basis is stated rather than implied.
--
-- `dependence`, `craving`, `addiction`, `anxiety` and `trauma` are left as
-- CANDIDATES, not refused: each is a real clinical entry whose surface form is
-- also an ordinary word, so the decision needs a reading this pass did not do.

do $seed$
declare
  v_active text[] := array[
    -- Substances, pharmacology and harm reduction
    '3-mmc','2c-b','agonist','alprazolam','amphetamine','antagonist','antidote','benzodiazepines',
    'cannabinoids','cathinones','cocaine','caffeine','comedown','delirium-tremens','depressants',
    'dextromethorphan','dissociatives','drug-checking','eyeballing','fentanyl','gaba','half-life',
    'heroin','ketamine','mdma','mephedrone','morphine','nitazenes','opioids','overdose',
    'psilocybin','psychedelics','recovery-position','serotonin','serotonin-syndrome','ssris',
    'stimulants','tramadol','withdrawal','sober',
    -- Clinical, sexual and reproductive health, gender-affirming care
    'androgen','antiretroviral-therapy','avanafil','chlamydia','endometriosis','erectile-dysfunction',
    'estradiol','estrogens','feminizing-hormone-therapy','gender-affirming-care','gender-affirming-surgery',
    'gender-dysphoria','gender-transition','hepatitis-b','hepatitis-c','hiv-aids','hiv-transmission',
    'hormone-therapy','hysterectomy','orchiectomy','ovulation','phalloplasty','premature-ejaculation',
    'reproductive-health','secondary-sex-characteristics','social-transition','syphilis','testosterone',
    'uterus','vaccination','vaginoplasty','vulva','birth-control','comprehensive-sex-education',
    -- Identity and gender vocabulary
    'achillean','agender','asexuality','biological-sex','chosen-name','cisgender','femboy',
    'gender-affirmation','gender-expression','gender-identity','gender-marker','gender-non-conforming',
    'gender-roles','heterosexual','homosexuality','non-binary','questioning','sexual-identity',
    'transfeminine','celibacy','abstinence',
    -- Named concepts, movements, discrimination and consent vocabulary
    'ableism','age-of-consent','anti-racism','biphobia','body-image','body-modification','bullying',
    'coming-out','consent','cuckquean','drag-queen','drug-use','ethical-non-monogamy','forced-labor',
    'gay-liberation','hair-removal','homonationalism','monogamous','monogamy','non-monogamous',
    'outing','patriarchy','power-exchange','prejudice','prick','pride-flag','queer-studies',
    'queer-theory','safe-space','safer-sex','same-sex-relationship','self-care','self-determination',
    'spanking','stereotypes','stonewall-riots','suicide-prevention','transphobia','vetting',
    'sexual-orientation-and-gender-identity'
  ];
  -- Real clinical entries whose surface form is also an ordinary word. Pending a
  -- reading, not refused — tombstoning them would foreclose a legitimate term.
  v_candidate text[] := array['dependence','craving','addiction','anxiety','trauma'];
  v_reject jsonb := jsonb_build_object(
    'aids',            'case-insensitive match also hits the ordinary plural: "rein aids" (tag:training), "dressing aids" (tag:latex-clothing), "mobility aids" (tag:abasiophilia)',
    'binding',         'wrong sense in every sampled match: rope bondage, receptor chemistry ("binding to the androgen receptor") and contract law ("legally binding"); zero chest-binding matches',
    'chastity',        'splits between the kink device and religious vows — "vows of poverty, chastity, and obedience" on tag:nun and tag:sister',
    'casual',          'ordinary English adjective',
    'biology',         'ordinary English noun',
    'books',           'ordinary English noun',
    'comedy',          'ordinary English noun',
    'dinner',          'ordinary English noun',
    'anime',           'ordinary noun; no definition a reader needs',
    'counseling',      'ordinary English noun',
    'accessibility',   'ordinary English noun; the related "accessible" is already a styleguide context-term',
    'divorce',         'ordinary English noun',
    'confidentiality', 'ordinary English noun',
    'bisexual',        'in general public use; a link teaches nothing and spends the per-document budget',
    'transgender',     'in general public use; a link teaches nothing and spends the per-document budget',
    'homophobia',      'in general public use',
    'racism',          'in general public use',
    'sexuality',       'ordinary English noun',
    'violence',        'ordinary English noun',
    'therapy',         'ordinary English noun',
    'stress',          'ordinary English noun',
    'stage',           'ordinary English noun with several senses',
    'suicide',         'ordinary English noun, and crisis-adjacent; suicide-prevention is activated instead',
    'orgasm',          'in general public use',
    'intimate',        'ordinary English adjective',
    'intimacy',        'ordinary English noun',
    'medication',      'ordinary English noun',
    'massage',         'ordinary English noun',
    'makeup',          'ordinary English noun',
    'lubricant',       'ordinary English noun',
    'hormones',        'ordinary English noun; the specific hormones are activated instead',
    'fertility',       'ordinary English noun',
    'masculinity',     'ordinary English noun',
    'restaurant',      'ordinary English noun'
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
    select id, name into v_id, v_name from unified_tags
      where slug = v_slug and status = 'active' and merged_into_id is null;
    if v_id is null then
      v_missing := v_missing || v_slug;
      continue;
    end if;
    insert into glossary_link_terms (tag_id, surface_form, status, notes, reviewed_at)
    values (v_id, v_name, 'active',
            'Second tranche: shortlisted by 0 ordinary-prose hits + >=1 glossary hit, then judged technical/named-concept/jargon.',
            now())
    on conflict (surface_form_key) do nothing;
  end loop;

  foreach v_slug in array v_candidate loop
    select id, name into v_id, v_name from unified_tags
      where slug = v_slug and status = 'active' and merged_into_id is null;
    continue when v_id is null;
    insert into glossary_link_terms (tag_id, surface_form, status, notes)
    values (v_id, v_name, 'candidate',
            'Real clinical entry whose surface form is also an ordinary word; needs a read-back before activation.')
    on conflict (surface_form_key) do nothing;
  end loop;

  for v_slug, v_reason in select key, value #>> '{}' from jsonb_each(v_reject) loop
    select id, name into v_id, v_name from unified_tags
      where slug = v_slug and status = 'active' and merged_into_id is null;
    continue when v_id is null;
    insert into glossary_link_terms (tag_id, surface_form, status, rejection_reason)
    values (v_id, v_name, 'rejected', v_reason)
    on conflict (surface_form_key) do nothing;
  end loop;

  -- SOFT on preconditions: a sibling session may deprecate or rename a tag
  -- between authoring and CI, and aborting then punishes every migration queued
  -- behind this one. Report, do not fail.
  if array_length(v_missing, 1) > 0 then
    raise notice 'second tranche: % slug(s) had no active tag and were skipped: %',
      array_length(v_missing, 1), v_missing;
  end if;

  -- HARD on postconditions, asserted against the real objects.
  select count(*) into v_live from glossary_link_terms_public;
  if v_live < 100 then
    raise exception 'expected the readable view to carry the tranche, got % rows', v_live;
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
