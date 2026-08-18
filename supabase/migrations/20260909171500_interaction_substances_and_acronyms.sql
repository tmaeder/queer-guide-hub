-- The ten substances the interaction chart needs, plus the acronym fix they exposed.
--
-- WHY THESE TEN
--
-- TripSit's combination data covers 31 substances. Twenty-one already exist as
-- tags after the saferparty import; these are the missing ten. Without them the
-- matrix can only render 398 of its 841 pairs, and the missing rows are not
-- marginal — MAOIs and SSRIs carry the serotonin-syndrome interactions, which
-- are the most lethal cells on the chart.
--
-- MAOIs, SSRIs, lithium and diphenhydramine are prescription or over-the-counter
-- medicines, not recreational drugs, and it is fair to ask why they sit in a
-- "Substances & Harm Reduction" glossary. They are here because the danger is in
-- the COMBINATION: someone on an SSRI who takes MDMA, or on lithium who takes a
-- stimulant, is the exact reader this chart exists for. Omitting them would make
-- the chart look complete while hiding its most important warnings.
--
-- THE ACRONYM FIX
--
-- `normalize_tag_name()` title-cases each letter run unless the run is entirely
-- uppercase or appears in its `acronyms` allowlist. That silently rewrote five
-- of these ten:
--
--   NBOMes    -> Nbomes
--   MAOIs     -> Maois
--   SSRIs     -> Ssris
--   5-MeO-xxT -> 5-Meo-Xxt
--   2C-T-x    -> 2C-T-X
--
-- "Ssris" is not a stylistic quibble on a page that warns about serotonin
-- syndrome — mis-capitalising a drug class is the kind of detail that tells a
-- reader the page was not written by anyone who knows the subject, on precisely
-- the page where that judgement matters most. The function already supports
-- mixed-case acronyms (`PrEP` is in the list), so the fix is to extend the
-- allowlist rather than to fight the trigger.
--
-- `2C-T-x` is left as `2C-T-X`. Preserving its lowercase `x` would mean adding
-- the single letter `x` to the acronym list, which would then force every
-- standalone "X" in the corpus lowercase — including a future tag about X, the
-- platform. An uppercase X still reads correctly as the family's variable
-- position, and the slug (`2c-t-x`) is unaffected either way.
--
-- PROSE CHECKED AGAINST THE DATA IT SITS BESIDE
--
-- Two of these descriptions were written before the TripSit matrix was loaded
-- and contradicted it. Both were corrected here rather than shipped:
--
--   * lithium said "stimulants or psychedelics" lower the seizure threshold.
--     TripSit rates amphetamines+lithium Low Risk & No Synergy and
--     cocaine+lithium Low Risk & Decrease. Only the psychedelic half is
--     supported, and that half is emphatic (12 Dangerous pairings).
--   * MAOIs claimed to be "the most dangerous interaction class on the chart".
--     Measured: tramadol has 27 unsafe-or-dangerous pairings of 30 (90%), AMT
--     15, DXM 20, against MAOIs' 12 of 27. The superlative was simply false.
--
-- A description that disagrees with the chart rendered directly beneath it
-- destroys trust in both. Re-check this whenever the combo data is refreshed.
--
-- Adding to this allowlist is safe in both directions: nothing in the corpus
-- currently normalises to any of these strings (checked before writing), and any
-- future tag that does will now get the correct casing instead of the wrong one.

create or replace function public.normalize_tag_name(input text)
 returns text
 language plpgsql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  acronyms text[] := ARRAY['LGBT','LGBTQ','LGBTQI','LGBTQIA','LGBTQIAP','LGBTI',
    'BIPOC','POC','BDSM','HIV','AIDS','STI','STD','NSFW','SFW',
    'FTM','MTF','AFAB','AMAB','NB','TERF','PrEP','PEP','DJ','VJ','MC',
    -- Chemical and pharmacological acronyms. Mixed-case ones only need to be
    -- here; all-uppercase runs (LSD, MDMA, DMT, GHB, PCP, MXE, AMT) are already
    -- preserved by the run = upper(run) branch below.
    'NBOMe','NBOMes','NBOH','MeO','xxT','MAOI','MAOIs','SSRI','SSRIs',
    'SNRI','SNRIs','THC','CBD','DXM'];
  collapsed text;
  result text := '';
  run text := '';
  i int;
  len int;
  ch text;
  next_ch text;
  prev_ch text;
  is_letter boolean;
  is_apos_in_word boolean;
  acro text;
  matched text;
  upper_run text;
  cap text;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  collapsed := regexp_replace(btrim(input), '\s+', ' ', 'g');
  IF collapsed = '' THEN RETURN ''; END IF;
  len := length(collapsed);

  FOR i IN 1..len LOOP
    ch := substring(collapsed FROM i FOR 1);
    next_ch := CASE WHEN i < len THEN substring(collapsed FROM i+1 FOR 1) ELSE '' END;
    prev_ch := CASE WHEN i > 1 THEN substring(collapsed FROM i-1 FOR 1) ELSE '' END;
    is_letter := ch ~ '[[:alpha:]]';
    is_apos_in_word := ch IN ('''','’','‘')
      AND prev_ch ~ '[[:alpha:]]'
      AND next_ch ~ '[[:alpha:]]';

    IF is_letter OR is_apos_in_word THEN
      run := run || ch;
    ELSE
      IF run <> '' THEN
        upper_run := upper(run);
        matched := NULL;
        FOREACH acro IN ARRAY acronyms LOOP
          IF upper(acro) = upper_run THEN matched := acro; EXIT; END IF;
        END LOOP;
        IF matched IS NOT NULL THEN cap := matched;
        ELSIF length(run) >= 2 AND run = upper_run THEN cap := run;
        ELSE cap := upper(substring(run FROM 1 FOR 1)) || lower(substring(run FROM 2));
        END IF;
        result := result || cap;
        run := '';
      END IF;
      result := result || ch;
    END IF;
  END LOOP;

  IF run <> '' THEN
    upper_run := upper(run);
    matched := NULL;
    FOREACH acro IN ARRAY acronyms LOOP
      IF upper(acro) = upper_run THEN matched := acro; EXIT; END IF;
    END LOOP;
    IF matched IS NOT NULL THEN cap := matched;
    ELSIF length(run) >= 2 AND run = upper_run THEN cap := run;
    ELSE cap := upper(substring(run FROM 1 FOR 1)) || lower(substring(run FROM 2));
    END IF;
    result := result || cap;
  END IF;

  RETURN result;
END $function$;

do $mig$
declare
  v_cat_id uuid; v_tag_id uuid; v_class_id uuid; r record; a text; v_n int;
begin
  perform set_config('app.actor', 'admin:interaction-substances', true);
  select id into strict v_cat_id from public.tag_categories where slug = 'substances-harm-reduction';

  create temp table _add (
    slug text primary key, name text not null, classes text[] not null default '{}',
    descr text not null, aliases text[] not null default '{}'
  ) on commit drop;

  insert into _add (slug, name, classes, descr, aliases) values
  ('nbomes','NBOMes','{"psychedelics","new-psychoactive-substances"}',
   'A family of extremely potent synthetic psychedelics, active in microgram amounts and frequently mis-sold as LSD. Unlike LSD they have a documented history of fatal overdose, and blotter paper alone cannot tell the two apart — this substitution is one of the clearest arguments for drug checking.',
   '{"25I-NBOMe","25B-NBOMe","25C-NBOMe","N-Bomb"}'),
  ('2c-t-x','2C-T-x','{"psychedelics","new-psychoactive-substances"}',
   'The sulphur-containing branch of the 2C family. Onset is slow and duration long, which is the usual route to accidental redosing, and several members cause pronounced nausea.',
   '{"2C-T-2","2C-T-7"}'),
  ('5-meo-xxt','5-MeO-xxT','{"psychedelics"}',
   'The 5-methoxy tryptamines, a group that includes 5-MeO-MiPT and 5-MeO-DiPT. Effects arrive abruptly and are more overwhelming than visual, and the group interacts dangerously with MAOIs.',
   '{"5-MeO-MiPT","5-MeO-DiPT"}'),
  ('mxe','MXE','{"dissociatives","new-psychoactive-substances"}',
   'Methoxetamine, a dissociative sold as a legal substitute for ketamine. It lasts substantially longer than ketamine and comes on more slowly, which is what drives redosing.',
   '{"Methoxetamine"}'),
  ('amt','AMT','{"psychedelics","new-psychoactive-substances"}',
   'Alpha-methyltryptamine, a long-acting psychedelic with stimulant properties. It inhibits monoamine oxidase, so it carries the same dangerous interactions as an MAOI on top of its own effects.',
   '{"Alpha-methyltryptamine","Indopan"}'),
  ('pcp','PCP','{"dissociatives"}',
   'Phencyclidine, a dissociative anaesthetic abandoned in human medicine because of the agitation and confusion patients experienced coming out of it. Its dose response is steep and hard to predict.',
   '{"Phencyclidine","Angel Dust"}'),
  ('maois','MAOIs','{"medicines"}',
   'Monoamine oxidase inhibitors, prescribed for depression and Parkinson''s disease and also present in ayahuasca. They block an enzyme that clears many other drugs, so combinations the body would ordinarily tolerate can become life-threatening — including with tyramine in ordinary food and drink.',
   '{"MAOI","Monoamine Oxidase Inhibitors","Moclobemide","Phenelzine"}'),
  ('ssris','SSRIs','{"medicines"}',
   'Selective serotonin reuptake inhibitors, the most commonly prescribed antidepressants. They blunt the effects of MDMA and other serotonergic drugs, and combining them can cause serotonin syndrome.',
   '{"SSRI","Fluoxetine","Sertraline","Citalopram"}'),
  ('lithium','Lithium','{"medicines"}',
   'A mood stabiliser prescribed for bipolar disorder. Combined with psychedelics it carries a well-documented risk of seizures and psychosis, which is why almost every psychedelic pairing on the interaction chart is marked dangerous.',
   '{"Lithium carbonate"}'),
  ('diphenhydramine','Diphenhydramine','{"medicines"}',
   'A sedating antihistamine sold over the counter, deliriant at high doses. The state it produces is confusional rather than psychedelic, and people in it are a genuine danger to themselves.',
   '{"Benadryl","DPH"}');

  for r in select * from _add order by slug loop
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description,
      is_sensitive, sensitive_topics, verification_status, human_reviewed,
      seo_indexable, last_verified_at
    ) values (
      r.name, r.slug, 'concept', 'active', r.descr, split_part(r.descr, '. ', 1) || '.',
      true, array['substance use','harm reduction'], 'reviewed', true, true, now()
    )
    on conflict (slug) do update set
      name = excluded.name, entity_kind = 'concept', status = 'active',
      description = excluded.description, short_description = excluded.short_description,
      is_sensitive = true, sensitive_topics = excluded.sensitive_topics,
      verification_status = 'reviewed', human_reviewed = true, seo_indexable = true,
      merged_into_id = null, deprecated_at = null, deprecation_reason = null,
      last_verified_at = now(), updated_at = now();
  end loop;

  -- Row by row: see the 27000 re-entrancy note in 20260907100000.
  for r in select a.slug, t.id tag_id from _add a join public.unified_tags t on t.slug = a.slug loop
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.tag_id, v_cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
  end loop;

  for r in select * from _add order by slug loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    foreach a in array r.classes loop
      select id into v_class_id from public.unified_tags where slug = a;
      if v_class_id is not null and v_class_id <> v_tag_id then
        insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
        values (v_tag_id, v_class_id, 'broader', 1.0, 'approved')
        on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
      end if;
    end loop;
    -- Same shadow rule as the substance import: skip rather than abort.
    foreach a in array r.aliases loop
      insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
      select v_tag_id, a, public.normalize_tag_slug(a), 'synonym', 'approved'
      where not exists (
        select 1 from public.unified_tags u
         where lower(u.slug) = public.normalize_tag_slug(a)
           and u.status = 'active' and u.id <> v_tag_id)
      on conflict (alias_slug) do nothing;
    end loop;
  end loop;

  select count(*) into v_n from _add a
    join public.unified_tags t on t.slug = a.slug
   where t.status = 'active' and t.human_reviewed and t.is_sensitive
     and t.seo_indexable and t.verification_status = 'reviewed';
  if v_n <> 10 then
    raise exception 'interaction substances: expected 10 publishable, got %', v_n;
  end if;

  -- The acronym fix must actually hold through the triggers.
  select count(*) into v_n from public.unified_tags
   where slug in ('nbomes','maois','ssris','5-meo-xxt')
     and name in ('NBOMes','MAOIs','SSRIs','5-MeO-xxT');
  if v_n <> 4 then
    raise exception 'interaction substances: acronym casing did not survive the name trigger (% of 4)', v_n;
  end if;
end
$mig$;
