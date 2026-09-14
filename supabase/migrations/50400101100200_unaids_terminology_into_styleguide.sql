-- The third half of the seven-source comparison, and the one that is not about
-- tags at all.
--
-- The UNAIDS 2024 Terminology Guidelines are not a glossary. They are a
-- LANGUAGE standard: a "Do not use / Preferred term" table plus commentary,
-- which is the exact shape of `styleguide_terms` (avoid[] -> preferred, with a
-- rationale). So the right place for this source is the styleguide, not the
-- glossary, and this is the first time an external authority has been imported
-- into that system.
--
-- CHECKING OUR STANDARD AGAINST THEIRS CORROBORATED IT MORE THAN IT CORRECTED
-- IT, which is worth recording because it is the opposite of what a comparison
-- usually finds. Six UNAIDS rules were already present, arrived at
-- independently: `living-with-hiv` already avoids "HIV-infected", "AIDS victim"
-- and "AIDS sufferer"; `hiv-negative` already avoids "clean" and "DDF";
-- `people-who-use-drugs` already avoids "addict" and "substance abuser";
-- `sex-worker` already avoids "prostitute"; `condomless` already avoids
-- "unprotected sex"; `u-equals-u` already refuses to hedge U=U.
--
-- FIVE ARE GENUINELY MISSING AND ARE ADDED. Each was measured against our own
-- voice first (active `unified_tags` prose, `cities`, `countries`,
-- `queer_villages` — the same own-voice surfaces `styleguide_content_drift()`
-- scans; venues, events, news and marketplace are third-party text and are a
-- separate decision about whose voice binds):
--
--   safe sex                      22 hits   <- the whole reason this file exists
--   sexually transmitted disease   3 hits
--   mother-to-child transmission   2 hits
--   HIV virus / AIDS virus         1 hit
--   high-risk group / risk group   0 hits
--
-- THE PRECISION RULE FROM v1.2.0 IS WHAT SHAPED THIS LIST: an avoid entry must
-- be wrong in essentially every context, or it teaches the model to avoid
-- correct English. So each phrase was checked for its own false-positive
-- mechanism before being written down, and two UNAIDS entries were REJECTED on
-- that basis:
--
--   "target" and "intervention" are ordinary English and ordinary health
--   English respectively; UNAIDS itself says "intervention" is correct in
--   structural, health-care and health-systems contexts. Adding either would
--   reproduce the `urban area` mistake, which was 158 hits and 100% noise.
--
--   Bare "STD" measures **0** in our own voice, so it buys nothing as a
--   matcher; it lives in the context note instead, where it can still instruct
--   a model without arming a scanner.
--
-- The one entry that could have been noise was checked rather than assumed:
-- "safe sex" is a substring of "unsafe sex", which is a different word with a
-- different problem. Measured: **0 of the 22 hits are "unsafe sex"**, so the
-- entry has no false-positive mechanism in this corpus.
--
-- THIS ADDS THE STANDARD AND DOES NOT REWRITE THE CORPUS. Bulk-rewriting the
-- prose behind those 22 hits is the experiment this repo already ran and
-- retired, when the tag prose judge retracted 16 of its first 18 rows with 13
-- of them wrong. `styleguide_content_drift()` counts them; a human fixes them.
-- The four hits that ARE repaired live are repaired in 50400101100000, by
-- single-phrase substitution on rows this pass was already correcting, and the
-- two "mother-to-child transmission" hits on `zidovudine` are deliberately left
-- standing: that phrasing is the historical name of the trial the drug is known
-- for, and rewriting a historical claim is a different decision from setting a
-- standard for new copy. So this file ships with a KNOWN, NAMED, non-zero
-- backlog rather than a reassuring zero.
--
-- PUBLISHING IS PART OF THE CHANGE, NOT A FOLLOW-UP. `styleguide_compile()`
-- freezes every profile into an immutable version row AT PUBLISH TIME, and
-- `getVoicePrompt()` serves the frozen row — so inserting terms without calling
-- `styleguide_publish()` leaves the fleet running on the old prompt while every
-- check reports success. That is the "shipped and wired to nothing" failure
-- this file's own system was built after (the Village Truth Engine relink batch
-- that sat with no cron), and the postcondition below asserts the published
-- text actually contains the new terms rather than asserting the rows exist.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:unaids-terminology', true);

do $mig$
declare
  v_n int;
begin
  insert into public.styleguide_terms (slug, preferred, avoid, category, severity, rationale, context_note, sort_order)
  values
    ('safer-sex',
     'safer sex',
     array['safe sex'],
     'health', 'avoid',
     'No sex is risk-free, and "safe" promises something no barrier, drug or test delivers. "Safer" is the harm-reduction word precisely because it admits a spectrum, which is what lets a reader place their own choices on it instead of reading themselves as having failed a binary.',
     'UNAIDS 2024 Terminology Guidelines list "safe sex" under Do Not Use. Note that "unsafe sex" is a separate problem and a separate entry; prefer naming the specific act and the specific protection.',
     81),
    ('sti-not-std',
     'sexually transmitted infection (STI)',
     array['sexually transmitted disease', 'venereal disease'],
     'health', 'avoid',
     'Most of these are infections that are often asymptomatic and usually curable or manageable; "disease" implies visible, permanent illness and carries the older moral freight that "venereal" carries openly. Our own canonical tag is `sti`, so the prose was disagreeing with the taxonomy.',
     'Bare "STD" is not in the avoid list because it measures zero in our own voice and would arm a scanner for nothing — but prefer STI there too. Keep "STD" when quoting a source or a clinic that uses it.',
     82),
    ('hiv-not-hiv-virus',
     'HIV',
     array['HIV virus', 'AIDS virus'],
     'health', 'avoid',
     'The V already stands for virus, so "HIV virus" reads as an author who does not know the term they are using — on the subject where a reader is least willing to extend that benefit of the doubt. "AIDS virus" is worse: AIDS is a syndrome and is not the name of a virus.',
     null,
     83),
    ('vertical-transmission',
     'vertical transmission of HIV',
     array['mother-to-child transmission'],
     'health', 'avoid',
     'It names one parent as the route and, on a platform read by queer families, excludes every other shape a parent comes in. "Vertical" states the direction without assigning either a gender or a fault.',
     'UNAIDS also accepts "parent-to-child transmission". Historical programme names (PMTCT, and the trials that established it) may keep their own wording when the sentence is about that history.',
     84),
    ('key-populations',
     'key populations, or name the specific behaviour',
     array['high-risk group', 'risk group', 'most-at-risk population'],
     'health', 'avoid',
     'Risk is something a situation does to people, not a property they carry, and "high-risk group" relocates it into the people — which is exactly how a group ends up policed rather than served. Naming the behaviour and the conditions around it is both more accurate and more actionable.',
     'Measured at zero hits in our own voice when added: this entry is prevention, not cleanup.',
     85)
  on conflict (slug) do nothing;

  get diagnostics v_n = row_count;
  raise notice 'unaids: inserted % new styleguide term(s)', v_n;
end $mig$;

-- Publish, or the fleet keeps running on the previous frozen prompt.
--
-- `styleguide_publish()` itself cannot be called from here: it is
-- SECURITY DEFINER and its first statement is
-- `IF NOT has_role_jwt('admin') THEN RAISE 'unauthorized'`, and a migration
-- has no JWT. The gate and the work are deliberately separate functions, so
-- the migration calls the core with a NULL publisher — which is also honest,
-- because no human published this.
select public._styleguide_publish_core(
  'minor',
  'UNAIDS 2024 Terminology Guidelines: five HIV/STI language rules the standard did not carry.',
  null
);

do $verify$
declare
  v_txt text;
  v_bad int;
begin
  select count(*) into v_bad from public.styleguide_terms
   where slug in ('safer-sex','sti-not-std','hiv-not-hiv-virus','vertical-transmission','key-populations')
     and is_active and category = 'health';
  if v_bad <> 5 then
    raise exception 'verify: expected 5 active UNAIDS terms, found %', v_bad;
  end if;

  -- Assert the PUBLISHED TEXT, not the rows. Rows without a publish are inert,
  -- and asserting `styleguide_terms` would pass in exactly that state.
  select compiled_prompt into v_txt from public.styleguide_versions where is_active;
  if v_txt is null or length(v_txt) < 500 then
    raise exception 'verify: no active styleguide version, or it is implausibly short';
  end if;
  if position('safe sex' in v_txt) = 0 or position('sexually transmitted disease' in v_txt) = 0 then
    raise exception 'verify: the published prompt does not carry the new terms — publish did not take';
  end if;

  -- Every profile is frozen at publish time, so the compact one must carry them too;
  -- `getVoicePrompt()` defaults to a profile, not to compiled_prompt.
  select doc->'prompts'->>'compact' into v_txt from public.styleguide_versions where is_active;
  if v_txt is null or position('safe sex' in v_txt) = 0 then
    raise exception 'verify: the compact profile does not carry the new terms';
  end if;

  -- The six rules UNAIDS corroborates must still be there: this file adds, never replaces.
  select count(*) into v_bad from public.styleguide_terms
   where slug in ('living-with-hiv','hiv-negative','people-who-use-drugs','sex-worker','condomless','u-equals-u')
     and is_active;
  if v_bad <> 6 then
    raise exception 'verify: % of the 6 pre-existing HIV language rules survived, expected 6', v_bad;
  end if;
end $verify$;
