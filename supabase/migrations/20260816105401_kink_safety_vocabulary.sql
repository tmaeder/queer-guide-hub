-- Kink-safety and sexual-health vocabulary: SSC / RACK / PRICK, consent,
-- safewords, aftercare, prevention terms and the missing STI tags.
--
-- WHY THIS EXISTS
--
-- The glossary carries ~80 substance terms with harm-reduction framing, but the
-- kink-safety frameworks the community actually teaches (SSC, RACK, PRICK), the
-- consent vocabulary around them, and several of the STIs the sexual-health
-- pages need (shigella, hepatitis A, mpox under its current name) were either
-- missing, deprecated, or — in one case — actively wrong. This is the same
-- REVIVE-not-insert shape as 20260907100000_saferparty_substance_tags: upsert
-- by slug, one row per statement, human_reviewed=true so
-- deprecate_unused_tags() cannot kill them again.
--
-- THE `rack` TAG WAS POINTING AT THE WRONG CONCEPT ENTIRELY
--
-- Its description claimed RACK is "the act of injecting drugs during sex"
-- (that practice is slamming) and its wikidata_id was Q571734 — a physical
-- rack. Same defect class as the hate-crimes→TV-episode repair
-- (20260906100100): `human_reviewed` is a flag, not evidence. The acronym's
-- real concept already exists as `risk-aware-consensual-kink`, so `rack` is
-- merged into it. merge_tag_concept records the dup's slug as an *approved*
-- alias, and "rack" is an ordinary English word — under the 20260910151200
-- rule approved aliases ARE auto-tagging rules, which would tag every clothes
-- rack and server rack as consensual kink. The alias is therefore demoted to
-- review_status='auto' immediately after the merge (recorded, resolvable,
-- never trusted by the reconciler).
--
-- SENSITIVITY IS PER-ROW, NOT BLANKET
--
-- The kink-framework terms get is_sensitive=true (renders TagSafetyCallout's
-- framing + /help link, same as the substance terms). The STI/prevention terms
-- deliberately do NOT: `hiv` is not sensitive today and a sexual-health page
-- behind a content wall helps nobody. `verification_status='reviewed'` is set
-- everywhere regardless, because sensitive-without-reviewed is anon-invisible.
--
-- THE PROSE IS OURS
--
-- Factual grounding comes from the "Kink Responsibly" education programme
-- (Darklands) and standard sexual-health guidance; not one sentence is copied.

set local statement_timeout = '600s';

do $mig$
declare
  v_tag_id uuid;
  v_cat_id uuid;
  v_rack_id uuid;
  v_canon_id uuid;
  r record;
  v_n int;
begin
  perform set_config('app.actor', 'admin:kink-safety-vocabulary', true);

  ---------------------------------------------------------------------------
  -- 1. The vocabulary. `cat` is a tag_categories slug; `sens` drives
  --    is_sensitive per row (see header).
  ---------------------------------------------------------------------------
  create temp table _kv (
    slug text primary key,
    name text not null,
    cat text not null,
    sens boolean not null,
    topics text[] not null default '{}',
    descr text not null,
    longdescr text
  ) on commit drop;

  insert into _kv (slug, name, cat, sens, topics, descr, longdescr) values

  -- ── consent frameworks ──────────────────────────────────────────────────
  ('ssc', 'SSC', 'consent-negotiation', true, array['kink','consent'],
   'Safe, Sane and Consensual — the baseline framework the kink community uses to judge whether play is okay. Safe: reduce risks with the right gear, skills and clear agreements. Sane: play in a clear, rational state of mind. Consensual: everything rests on voluntary agreement that can be withdrawn at any moment.',
   'SSC is the oldest of the three consent frameworks used in kink and BDSM, and the one most newcomers meet first. Each letter is a test a scene has to pass before it starts.

Safe means the risks have been reduced as far as they reasonably can be: the right equipment, the skills to use it, and agreements made before anyone is tied, restrained or worked over. A practical example is discussing duration and safety knots before bondage — including how quickly someone can be cut free.

Sane means everyone involved is in a clear, rational mental state — sober enough, rested enough and present enough to judge what is happening and to notice when something is going wrong.

Consensual means every part of the scene rests on voluntary, revocable agreement. Consent given once is not consent forever, and a safeword ends the scene without discussion.

SSC has a known limitation: some kink is never entirely "safe", and calling it safe can hide real risks instead of naming them. That critique produced RACK (Risk-Aware Consensual Kink) and later PRICK (Personal Responsibility Informed Consensual Kink), which make the risks — and each participant''s responsibility for them — explicit.'),

  ('risk-aware-consensual-kink', 'Risk-Aware Consensual Kink', 'consent-negotiation', true, array['kink','consent'],
   'RACK — a consent framework that replaces "safe" with "risk-aware": kink carries inherent risks that cannot all be engineered away, so participants name them openly and consent in full knowledge of them. The core question is: do we understand the risks, and do we consent to them?',
   'Risk-Aware Consensual Kink (RACK) grew out of a critique of SSC: no amount of preparation makes rope, impact or breath play entirely "safe", and pretending otherwise hides risk instead of managing it.

RACK asks two things of everyone in a scene. Risk-aware: acknowledge that the activities have inherent risks, and discuss them openly and specifically — not "this could be intense" but what can actually go wrong and what the plan is if it does. A practical example is evaluating intensity and potential impact before impact play. Consensual kink: every participant gives explicit consent, fully informed of those risks.

RACK does not lower the bar — it raises the honesty. A scene that only works if nobody mentions the risks is not a RACK scene.

PRICK (Personal Responsibility Informed Consensual Kink) builds one step further, adding each participant''s personal responsibility to the frame.'),

  ('prick', 'PRICK', 'consent-negotiation', true, array['kink','consent'],
   'Personal Responsibility Informed Consensual Kink — a framework that builds on RACK by making each participant''s own responsibility explicit. Where RACK asks "do we understand the risks and consent to them?", PRICK asks "what is my responsibility in what we are choosing to do?"',
   'PRICK (Personal Responsibility Informed Consensual Kink) is the most recent of the three consent frameworks, built directly on RACK.

RACK''s core question is collective: do we understand the risks, and do we consent to them? PRICK adds an individual one: what is my personal responsibility in this dynamic?

Two ideas carry the framework. Responsibility: each person owns their share of what the scene needs — knowing their body, preparing their role, speaking up early. Empowerment: each participant is responsible for being honest about their limits, their health and their headspace, before and during play. Nobody can consent well on someone else''s behalf, and nobody can outsource their own honesty.

In practice the three frameworks stack rather than compete: SSC sets the baseline, RACK makes the risks explicit, PRICK makes each person''s responsibility explicit.'),

  ('safewords', 'Safewords', 'consent-negotiation', true, array['kink','consent'],
   'Words or signals agreed before play that pause or stop a scene the moment they are used. The most common system is the traffic light: green means go, yellow means pause or slow down, red means stop immediately. A safeword overrides everything else that was negotiated.',
   'A safeword is an agreed word or signal that cuts through a scene''s roleplay and negotiation: when it is used, the scene changes course immediately, no debate.

The traffic-light system is the most widely used because it carries more information than a single stop word. Green: go — everything is fine, continue or intensify. Yellow: pause or slow down — something needs adjusting without ending the scene. Red: stop immediately.

Safewords only work when they are agreed before play starts, and when everyone trusts they will be honoured instantly. For scenes where speaking is impossible — gags, hoods — agree a physical signal instead: dropping a held object, a rhythmic tap.

A safeword is not a failure. Calling yellow early is what keeps red from being needed. Discussing expectations and triggers beforehand — many people use a kink checklist for this — is what makes the safeword a backstop rather than the whole safety plan.'),

  ('consent', 'Consent', 'consent-negotiation', false, '{}',
   'Voluntary, informed, revocable agreement to what is happening — the foundation every sexual and kink interaction rests on. Consent is only valid when it is freely given, informed, reversible, specific and enthusiastic, and it can be withdrawn at any moment.',
   'True consent has to meet five anchors at once. Freely given: no pressure, guilt or manipulation. Informed: everyone knows exactly what is going to happen — and what is not. Reversible: anyone can stop or change their mind at any moment, including mid-act. Specific: a yes to touching is not a yes to sex; a yes to one act is not a yes to the next. Enthusiastic: you truly want it, rather than letting it happen.

Not everyone says "no" directly when a boundary is crossed. Some people freeze, and some go along with the situation to keep the peace — an unconscious pleasing response sometimes called fawning: saying yes while actually feeling a no. Silence is therefore never a yes. Body language is part of the conversation: tensing up, looking away or a vacant stare are signals to pause immediately and check in.

No consciousness means no consent. Under the influence of alcohol or other substances, boundaries and signals fade more quickly. Someone who cannot communicate clearly, or who is semi-conscious or unconscious, cannot give consent. Take care of each other: stop the action and check in.

Consent applies everywhere, including spaces built for sex. Being in a darkroom is not consent. And consent already given can always be withdrawn — "I said yes earlier" never obliges anyone to continue.'),

  ('aftercare', 'Aftercare', 'bdsm-power-exchange', true, array['kink','consent'],
   'The emotional and physical care people give each other after an intense scene — water, warmth, contact, conversation. Aftercare is how everyone involved lands safely, and it is negotiated before play, not improvised after it.',
   'Intense play moves a lot of adrenaline and endorphins, and the comedown afterwards can be physical (cold, shaky, exhausted) and emotional (raw, tearful, spaced out) — for tops as well as bottoms. Aftercare is the agreed landing: what each person needs after the scene ends, decided before it starts.

What it looks like differs per person: a hug, a blanket, water and something to eat, quiet company, or talking the scene through together. Reflecting together is also where the next scene gets better — what worked, what did not, what to change.

Practical preparation belongs to the same habit: keep first-aid essentials nearby (safety scissors, water, snacks), agree safewords beforehand, and use a checklist to discuss expectations and triggers before anyone starts. Aftercare is not an optional extra for heavy scenes — it is part of the scene.'),

  -- ── prevention & sexual health ──────────────────────────────────────────
  ('prep', 'PrEP', 'sexual-health', true, '{}',
   'Pre-exposure prophylaxis — a pill taken preventively so an HIV infection cannot establish itself. PrEP protects only against HIV, so it is best combined with condoms for other STIs. It offers real freedom and safety when condom use is not always possible.',
   null),

  ('pep', 'PEP', 'sexual-health', true, '{}',
   'Post-exposure prophylaxis — an emergency HIV treatment taken for one month, started within 72 hours after sexual contact without a condom or PrEP. Available through hospital emergency rooms and HIV reference centres; the sooner it starts, the better it works.',
   null),

  ('u-equals-u', 'U=U', 'sexual-health', false, '{}',
   'Undetectable = Untransmittable. Someone living with HIV who takes their medication correctly and keeps their viral load undetectable cannot transmit HIV through sex. U=U is settled science and one of the pillars of combination prevention.',
   null),

  -- ── STIs missing or misnamed ────────────────────────────────────────────
  ('shigella', 'Shigella', 'sexual-health', false, '{}',
   'An intestinal bacterium that causes severe diarrhea and spreads through tiny amounts of feces — rimming, fisting and shared toys are the common sexual routes. Outbreaks circulate among men who have sex with men, and some strains are antibiotic-resistant. Testing is a stool sample, usually only when symptoms are present.',
   null),

  ('hepatitis-a', 'Hepatitis A', 'sexual-health', false, '{}',
   'A viral liver infection spread by fecal-oral contact, including rimming. It usually clears on its own but can make you seriously ill for weeks. A safe, effective vaccine exists and is recommended for men who have sex with men.',
   null),

  -- Slug is 'mpox', not 'monkeypox': normalize_tag_input() regenerates the slug
  -- whenever a tag's NAME changes, so renaming the old row would move it to
  -- 'mpox' anyway. Upserting the modern slug directly and merging the old row
  -- into it (step 5) is the idempotent version of the same outcome, and the
  -- merge records 'monkeypox' as an alias so old links still resolve.
  ('mpox', 'Mpox', 'sexual-health', false, '{}',
   'Mpox (formerly monkeypox) is a viral infection that causes fever and characteristic blisters or sores on the skin. It spreads through prolonged close physical contact, which is why sexual networks carry it efficiently. A vaccine is available.',
   null),

  ('chemsex', 'Chemsex', 'substances-harm-reduction', true, array['substance use','harm reduction'],
   'The use of drugs — typically stimulants like methamphetamine, mephedrone or GHB — in combination with sex. Chemsex carries compounded risks: the substances themselves, their interactions, and the way they blur boundaries, consent and time.',
   'Chemsex means combining sex with drugs — most commonly crystal meth, mephedrone or 3-MMC, and GHB/GBL, sometimes injected ("slamming"), often alongside alcohol, poppers or erection medication.

The risks compound. The substances interact with each other (stimulants plus GHB strain the heart and nervous system; poppers plus erection medication crash blood pressure). Sessions stretch over hours or days, which erodes sleep, judgement and boundaries. And under the influence, consent signals fade: someone who cannot communicate clearly cannot consent.

Problematic use is not defined by frequency or by method. Any use can become harmful when it starts impacting other areas of life — work, relationships, mental well-being. Using less than once a month does not make it automatically fine, and using without slamming can still be problematic.

Two facts worth repeating: a GHB overdose is a medical emergency — call emergency services and use the recovery position, never "let them sleep it off"; and orange juice or tonic does not treat feeling sick from chems — medical help does.

Sober sex can feel flat for a while after regular chemsex. That is not permanent: sensitivity rebuilds by consciously choosing sober sex regularly. If use is worrying you, talk to a chemsex-literate service — you do not have to hit a crisis first.');

  ---------------------------------------------------------------------------
  -- 2. Upsert the tags. One row per statement (27000 rule, see the
  --    saferparty header). Revives deprecated rows.
  ---------------------------------------------------------------------------
  for r in select * from _kv order by slug loop
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description,
      long_description, is_sensitive, sensitive_topics, verification_status,
      human_reviewed, seo_indexable, last_verified_at
    ) values (
      r.name, r.slug, 'concept', 'active', r.descr, split_part(r.descr, '. ', 1) || '.',
      r.longdescr, r.sens, r.topics, 'reviewed', true, true, now()
    )
    on conflict (slug) do update set
      name              = excluded.name,
      entity_kind       = 'concept',
      status            = 'active',
      description       = excluded.description,
      short_description = excluded.short_description,
      -- Only replace prose we authored a replacement for; a null in _kv means
      -- "keep whatever the tag already has".
      long_description  = coalesce(excluded.long_description, unified_tags.long_description),
      is_sensitive      = excluded.is_sensitive,
      sensitive_topics  = excluded.sensitive_topics,
      verification_status = 'reviewed',
      human_reviewed    = true,
      seo_indexable     = true,
      merged_into_id    = null,
      deprecated_at     = null,
      deprecation_reason = null,
      last_verified_at  = now(),
      updated_at        = now();
  end loop;

  ---------------------------------------------------------------------------
  -- 3. Category assignments, written directly (27000 rule). The new category
  --    becomes primary; any other assignment the tag carries is demoted so the
  --    frontend's "first is_primary wins" pick is deterministic.
  ---------------------------------------------------------------------------
  for r in select k.slug, k.cat, t.id as tag_id
           from _kv k join public.unified_tags t on t.slug = k.slug order by k.slug loop
    select id into strict v_cat_id from public.tag_categories where slug = r.cat;

    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.tag_id, v_cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;

    update public.tag_category_assignments
       set is_primary = false
     where tag_id = r.tag_id and category_id <> v_cat_id and is_primary;
  end loop;

  ---------------------------------------------------------------------------
  -- 4. Repair `rack`: merge the mislabelled duplicate into the real concept.
  --    Guarded like the saferparty merges — a re-run (rack already merged)
  --    degrades to a notice, not an abort.
  ---------------------------------------------------------------------------
  select id into v_rack_id  from public.unified_tags where slug = 'rack';
  select id into v_canon_id from public.unified_tags where slug = 'risk-aware-consensual-kink';
  if v_rack_id is not null and v_canon_id is not null and v_rack_id <> v_canon_id then
    begin
      perform public.merge_tag_concept(v_canon_id, v_rack_id,
        'admin:kink-safety-vocabulary', 'rack-wrong-entity-repair');
    exception when others then
      raise notice 'merge risk-aware-consensual-kink <- rack skipped: %', sqlerrm;
    end;
  end if;

  -- merge_tag_concept files the dup slug as an APPROVED alias, and approved
  -- aliases are auto-tagging rules (20260910151200). "rack" is an ordinary
  -- English word — demote to 'auto' so it stays recorded but never trusted.
  update public.tag_aliases
     set review_status = 'auto'
   where alias_slug = 'rack' and review_status = 'approved';

  -- merge_tag_concept overwrites app.actor; restore it for the trailing writes.
  perform set_config('app.actor', 'admin:kink-safety-vocabulary', true);

  -- The merged tag also inherited the wrong-entity wikidata_id; clear it so the
  -- canonical concept doesn't claim to be a physical rack.
  update public.unified_tags set wikidata_id = null
   where id = v_canon_id and wikidata_id = 'Q571734';

  ---------------------------------------------------------------------------
  -- 5. Fold the legacy monkeypox row into the new mpox tag. merge_tag_concept
  --    writes 'monkeypox' as an approved alias itself (not an ordinary word,
  --    so approved is safe), and old /tags/monkeypox lookups resolve through
  --    the alias path.
  ---------------------------------------------------------------------------
  select id into v_rack_id  from public.unified_tags where slug = 'monkeypox';
  select id into v_canon_id from public.unified_tags where slug = 'mpox';
  if v_rack_id is not null and v_canon_id is not null and v_rack_id <> v_canon_id then
    begin
      perform public.merge_tag_concept(v_canon_id, v_rack_id,
        'admin:kink-safety-vocabulary', 'mpox-who-rename');
    exception when others then
      raise notice 'merge mpox <- monkeypox skipped: %', sqlerrm;
    end;
  end if;
  perform set_config('app.actor', 'admin:kink-safety-vocabulary', true);

  ---------------------------------------------------------------------------
  -- 6. Ontology: the frameworks and their supports reference each other.
  ---------------------------------------------------------------------------
  for r in select * from (values
      ('ssc',                        'risk-aware-consensual-kink'),
      ('ssc',                        'prick'),
      ('risk-aware-consensual-kink', 'prick'),
      ('consent',                    'ssc'),
      ('consent',                    'risk-aware-consensual-kink'),
      ('consent',                    'prick'),
      ('consent',                    'safewords'),
      ('safewords',                  'ssc'),
      ('aftercare',                  'ssc'),
      ('aftercare',                  'consent'),
      ('hiv',                        'u-equals-u'),
      ('hiv',                        'prep'),
      ('hiv',                        'pep')
    ) as m(a, b) loop
    insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
    select ta.id, tb.id, 'related', 1.0, 'approved'
      from public.unified_tags ta, public.unified_tags tb
     where ta.slug = r.a and tb.slug = r.b and ta.id <> tb.id
    on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
  end loop;

  ---------------------------------------------------------------------------
  -- 7. Reference links (Elsewhere rail via get_tag_reference_links).
  ---------------------------------------------------------------------------
  for r in select * from (values
      ('ssc',                        'https://kinxlist.com/',
       'Kink checklist and scene-planning tool referenced by the Kink Responsibly education programme.'),
      ('ssc',                        'https://kinksheet.com/',
       'Kink negotiation sheet for discussing expectations and limits before play.'),
      ('risk-aware-consensual-kink', 'https://kinxlist.com/',
       'Kink checklist and scene-planning tool referenced by the Kink Responsibly education programme.'),
      ('risk-aware-consensual-kink', 'https://kinksheet.com/',
       'Kink negotiation sheet for discussing expectations and limits before play.'),
      ('prick',                      'https://kinxlist.com/',
       'Kink checklist and scene-planning tool referenced by the Kink Responsibly education programme.'),
      ('prick',                      'https://kinksheet.com/',
       'Kink negotiation sheet for discussing expectations and limits before play.'),
      ('safewords',                  'https://kinksheet.com/',
       'Kink negotiation sheet for discussing expectations and limits before play.'),
      ('consent',                    'https://chemsextherapist.com/consent.html',
       'Practical consent guidance, including consent under the influence of substances.'),
      ('chemsex',                    'https://www.thedrugswheel.com/',
       'The Drugs Wheel by Mark Adley — the substance-category model the chemsex wheel is adapted from (CC BY-NC-SA 4.0).'),
      ('sti',                        'https://testfinder.info/',
       'European Test Finder — hundreds of STI testing locations across Europe.'),
      ('hiv',                        'https://testfinder.info/',
       'European Test Finder — hundreds of STI testing locations across Europe.'),
      ('u-equals-u',                 'https://testfinder.info/',
       'European Test Finder — hundreds of STI testing locations across Europe.')
    ) as m(slug, url, summary) loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    if v_tag_id is not null then
      delete from public.tag_sources where tag_id = v_tag_id and source_url = r.url;
      insert into public.tag_sources (tag_id, source_type, source_url, claim_summary, fetched_at)
      values (v_tag_id, 'editorial', r.url, r.summary, now());
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- 8. Assertions.
  ---------------------------------------------------------------------------
  select count(*) into v_n
    from _kv k left join public.unified_tags t on t.slug = k.slug
   where t.id is null;
  if v_n > 0 then
    raise exception 'kink-safety vocabulary: % expected slugs missing after upsert', v_n;
  end if;

  select count(*) into v_n
    from _kv k join public.unified_tags t on t.slug = k.slug
   where t.status <> 'active' or t.human_reviewed is not true
      or t.verification_status <> 'reviewed' or t.seo_indexable is not true;
  if v_n > 0 then
    raise exception 'kink-safety vocabulary: % tags did not land in the publishable state', v_n;
  end if;

  if exists (select 1 from public.unified_tags where slug = 'rack' and status = 'active') then
    raise exception 'kink-safety vocabulary: rack is still an active tag after the merge';
  end if;

  if exists (select 1 from public.tag_aliases
              where alias_slug = 'rack' and review_status = 'approved') then
    raise exception 'kink-safety vocabulary: "rack" survived as an approved (auto-tagging) alias';
  end if;

  if not exists (select 1 from public.unified_tags
                  where slug = 'mpox' and name = 'Mpox' and status = 'active') then
    raise exception 'kink-safety vocabulary: mpox tag did not land';
  end if;
  if exists (select 1 from public.unified_tags where slug = 'monkeypox' and status = 'active') then
    raise exception 'kink-safety vocabulary: legacy monkeypox tag still active after the merge';
  end if;
end
$mig$;
