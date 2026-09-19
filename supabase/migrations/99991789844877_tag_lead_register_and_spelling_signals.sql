-- Glossary lead register + Commonwealth spelling: a RULE and a COUNTER, no prose rewritten.
--
-- Two axes the last two spelling passes kept re-discovering by hand. Neither is
-- repaired here. Both become a number the next reader can re-derive.
--
-- AXIS 1 -- THE SELF-REFERENTIAL LEAD. 199 active descriptions open by saying the
-- term EXISTS rather than what it MEANS: "Salirophilia refers to sexual arousal
-- from...", "Bussy is a slang term used primarily in...". The reader already knows
-- the word -- it is the page title directly above. The first clause is spent.
--
--   This is NOT covered by the existing tag-lead-is-not-an-encyclopedia-lead
--   (sort 314). That rule bans an official name, a formal classification, a
--   founding date or a nationality clause. "X refers to" is none of those: it is
--   not an encyclopedia lead, it is a self-referential one. Checked before
--   writing -- the new rule is its SIBLING at 315, in the same section and at the
--   same severity, not a replacement.
--
--   The count depends entirely on the anchor, which is why the anchor now lives
--   in SQL. Earlier hand measurements of this cohort ranged 133-199 depending on
--   whether the "is a term" shapes were included; that spread was a property of
--   the regex, not of the corpus. 22 of the 199 were sampled and hand-read:
--   22/22 genuine, 0 false positives.
--
-- AXIS 2 -- COMMONWEALTH SPELLING, AND THE MEASUREMENT INVERTED THE PLAN.
--
--   The brief was a straightforward "count British spellings". Measured, that is
--   ACTIVELY HARMFUL, and the decomposition is the finding:
--
--     A naive token sweep matches 68 rows. 24 of those are not British spellings
--     at all -- `analys` is a prefix of analyses/analysis/psychoanalysis,
--     `organis` of organism/microorganisms, `programme` of programmed. All
--     correct American. (That last one is on record: 99991789819393's own widened
--     sweep hit `programmed` and had to assert fembot/robot survive. Same class,
--     opposite direction.) Those are regex defects and are excluded outright.
--
--     Of the 44 that remain, 39 sit in descriptions >= 200 chars and every one
--     hand-read is IMPORTED ENCYCLOPEDIC PROSE: "Norway, officially the Kingdom
--     of Norway, is a Nordic country..." carrying `kilometres`; "Bali is an
--     Indonesian island and province..." carrying `centre`. The British spelling
--     arrived WITH the Wikipedia text. Their real defect is the encyclopedic lead
--     that rule 314 already governs -- and Americanizing `kilometres` on such a
--     row POLISHES THE WRONG THING: it makes an imported lead marginally more
--     American while leaving it imported. A gate that fires on those is standing
--     pressure to entrench the prose instead of replacing it.
--
--   So the counter is scoped to our OWN authored voice, and length is the
--   discriminator -- measured, not assumed:
--
--     descriptions <  200 chars: 4 of 2638 carry one  (0.15%)
--     descriptions >= 200 chars: 39 of 1002 carry one (3.9%)   -- 26x enrichment
--
--   The four are ours: areola, vaginal-discharge, toxidrome and
--   premenstrual-dysphoric-disorder. Two of them (areola, vaginal-discharge)
--   were written TODAY by a concurrent session's sex-glossary pass, hours after
--   the last spelling sweep cleaned the corpus. That is the whole argument for a
--   counter over a sweep: a sweep catches today's two and nothing after.
--
--   It UNDER-REACHES by construction -- an authored description over 200 chars is
--   missed. That is the correct error direction here, because the alternative
--   over-reaches into the imported cohort above.
--
-- THREE TOKENS ARE DELIBERATELY EXCLUDED, and each exclusion prevents a HARMFUL
-- "fix" rather than merely a noisy one:
--
--   grey    -- the ace-spectrum community's own spelling of itself. Live rows:
--              greysexual, greysexuality, greygender, grey-romantic. A gate that
--              counts these is standing pressure to overwrite what a community
--              calls itself. Also matches `greying` (grizzly-bear) and the
--              color-grey row, which is ABOUT the word.
--   labour  -- cannot distinguish a defect from an official name. Live rows carry
--              capitalised `Labour` in what is almost certainly the International
--              Labour Organization / Labour Party. An organisation's legal name
--              is not ours to respell.
--   haemo   -- `Haemophilus` (chancroid) is a Latin binomial. Genus names are
--              never Americanized. Excluded at TOKEN level via (?!philus), not by
--              a row-level filter: a row-level exclusion would also exempt a
--              genuine defect that happened to share the row.
--
-- Deliberately NOT done: no description is rewritten, including the four. Two of
-- them were authored hours ago by a session that may still be working those rows,
-- and this file's whole point is that the axis refills faster than a sweep runs.
--
-- Soft on preconditions, hard on postconditions.

begin;

-- 1 ------------------------------------------------------------------ the rule
--
-- `should`, matching its sibling at 314. styleguide_rules_binding_needs_reason
-- exempts `should` from carrying a rationale, so both 314 and spelling-and-units
-- have none; one is supplied anyway, because a rule without a reason gets argued
-- about forever.
insert into styleguide_rules (slug, section, title, body, severity, applies_to, rationale, sort_order, is_active)
values (
  'tag-lead-states-the-meaning-not-the-term',
  'persona',
  'Open with the meaning, not with the term',
  'Do not spend the first clause announcing that the term exists. "Salirophilia refers to sexual arousal from soiling a partner" and "Bussy is a slang term for..." both make the reader wait for the definition they came for. Start at the meaning: "Sexual arousal from soiling or dishevelling a partner." The reader already has the word -- it is the heading directly above. Naming the register is fine when it carries information a reader needs ("chiefly Black queer slang", "clinical shorthand"), but it belongs after the meaning, not in front of it.',
  'should',
  array['tag'],
  'The page title already states the term, so an opening clause that restates it is the one sentence a meta description and a search snippet are most likely to truncate -- the reader is shown the term twice and the meaning never.',
  315,
  true
)
on conflict (slug) do update
  set section    = excluded.section,
      title      = excluded.title,
      body       = excluded.body,
      severity   = excluded.severity,
      applies_to = excluded.applies_to,
      rationale  = excluded.rationale,
      sort_order = excluded.sort_order,
      is_active  = true;

-- 2 -------------------------------------------------------------- the counter
--
-- Restating the whole body is unavoidable to add a key, and is the established
-- shape here: 99960101100100 added `surname_stub` the same way. Every pre-existing
-- key and comment is carried through unchanged.
create or replace function public.tag_prose_standard_signals()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  with a as (
    select description as d
    from unified_tags
    where status = 'active'
      and description is not null
      and btrim(description, E' \t\n\r') <> ''
  )
  select jsonb_build_object(
    'probe_ok', true,
    'rows_scanned', count(*),
    -- a cap-length row that stops without a terminal mark has lost text
    'truncated_description', count(*) filter (
      where length(d) in (500, 1000, 2000)
        and d !~ '[.!?]["'')\]]?\s*$'),
    'stamp_as_definition', count(*) filter (
      where d ~* '^(updated )?[a-z]+ +[0-9]{1,2}, *[0-9]{4}'),
    -- ANCHORED, and the anchor is load-bearing: a bare "(may|could) refer to"
    -- also matches pansexuality's perfectly correct "Pansexual people may refer
    -- to themselves as gender-blind". A disambiguation list names itself at the
    -- start and opens a colon; ordinary prose does neither.
    'unresolved_disambiguation', count(*) filter (
      where d ~* '^[^.!?]{0,60}(may|could) refer to\s*:'),
    -- A SECOND disambiguation shape the anchor above structurally cannot see: an
    -- English Wikipedia surname stub, which names itself as a surname rather than
    -- opening "may refer to:". Eight of these were live and uncounted when this
    -- arm was added (99960101100100). Kept a separate key because it is
    -- REPAIRABLE -- null the description and let the thin-page gate deindex --
    -- where unresolved_disambiguation sits at a deliberate, unrepairable
    -- baseline. Zero-invariant. Both arms were measured corpus-wide: together
    -- they matched exactly the eight defective rows and nothing else.
    'surname_stub', count(*) filter (
      where d ~* 'Notable people with the (surname|given name|name)'
         or d ~* '^[^.!?]{0,80}\mis a surname\M'),
    -- The self-referential lead. ANCHORED to the opening clause for the same
    -- reason as unresolved_disambiguation above: unanchored, "refers to" matches
    -- correct prose mid-sentence. 22 of the 199 live matches were hand-read at
    -- 22/22 genuine. Advisory at its baseline, gated on GROWTH -- the backlog is
    -- worked down by rewriting prose, so a zero-invariant would ship red and be
    -- scrolled past.
    'refers_to_lead', count(*) filter (
      where d ~* '^[^.!?]{0,60}\m(refers? to|is a term|is a slang term|is an? (umbrella|informal|colloquial) term)\M'),
    -- Commonwealth spelling in OUR OWN authored voice only. The length bound is
    -- the discriminator and it is measured, not assumed (0.15% under 200 chars
    -- against 3.9% at or above it): almost every long description carrying a
    -- British spelling is imported Wikipedia prose, whose defect is the imported
    -- lead rather than the spelling. `grey`, `labour` and `analys` are absent on
    -- purpose -- see this migration's header; excluding them prevents a harmful
    -- "fix", not merely a noisy one. The three lookaheads exclude words that are
    -- correct American (organism, programmed) or a Latin binomial (Haemophilus).
    'commonwealth_in_own_voice', count(*) filter (
      where length(d) < 200
        and d ~* '(colour|behaviour|centre|programme(?!d)|litre|metre|fibre|defence|offence|licence|practise|organis[aei]|recognis|catalogu|paediatr|oestro|anaemi|diarrhoea|gonorrhoea|haemo(?!philus)|foetal|oedema|aluminium|sulphur|ageing|jewellery|honour|favour|flavour|neighbour|odour|rumour|savour|vapour|armour|tumour|vigour)'),
    'whitespace_dirty', count(*) filter (
      where d <> btrim(d, E' \t\n\r') or d ~ '[ \t]{2,}')
  )
  into v
  from a;

  return v;
exception when others then
  -- a probe that cannot run must SAY so rather than fall through to zeros
  return jsonb_build_object('probe_ok', false, 'error', sqlerrm);
end
$function$;

-- 3 ----------------------------------------------------------------- publish
--
-- styleguide_compile() freezes every profile into an immutable version row AT
-- PUBLISH TIME and getVoicePrompt() serves the frozen row, so inserting a rule
-- without publishing leaves the whole fleet on the old prompt while every check
-- reports success. styleguide_publish() RAISEs 'unauthorized' without an admin
-- JWT and a migration carries none, so the gate and the work are separate
-- functions by design; the NULL actor is honest, because no human published this.
select public._styleguide_publish_core(
  'minor',
  'Glossary lead register: open with the meaning, not by announcing the term. Adds refers_to_lead and commonwealth_in_own_voice to the structural sentinel.',
  null
);

-- 4 ---------------------------------------------------------- postconditions
do $verify$
declare
  v_sig     jsonb;
  v_ver     text;
  v_rule    int;
  v_prompt  text;
begin
  -- the rule exists, is active, and is a SIBLING of 314 rather than a replacement
  select count(*) into v_rule
  from styleguide_rules
  where slug = 'tag-lead-states-the-meaning-not-the-term'
    and is_active and severity = 'should' and section = 'persona'
    and sort_order = 315 and applies_to = array['tag'] and rationale is not null;
  if v_rule <> 1 then
    raise exception 'lead-register rule not installed as specified (found %)', v_rule;
  end if;

  if not exists (
    select 1 from styleguide_rules
    where slug = 'tag-lead-is-not-an-encyclopedia-lead' and is_active and sort_order = 314
  ) then
    raise exception 'sibling rule tag-lead-is-not-an-encyclopedia-lead is missing or moved -- the new rule was scoped to complement it';
  end if;

  -- the sentinel answers, still scans the corpus, and kept every pre-existing key
  v_sig := public.tag_prose_standard_signals();
  if coalesce(v_sig->>'probe_ok','') <> 'true' then
    raise exception 'sentinel probe is broken: %', coalesce(v_sig->>'error','(no error reported)');
  end if;
  if (v_sig->>'rows_scanned')::int < 1000 then
    raise exception 'sentinel scanned only % descriptions -- measuring nothing, not passing', v_sig->>'rows_scanned';
  end if;
  if not (v_sig ?& array['truncated_description','stamp_as_definition','unresolved_disambiguation',
                         'surname_stub','whitespace_dirty','refers_to_lead','commonwealth_in_own_voice']) then
    raise exception 'sentinel lost a key: %', v_sig;
  end if;

  -- the new arms measure SOMETHING. A zero here means the regex matched nothing,
  -- which on this corpus is a broken arm rather than a clean corpus -- the whole
  -- reason both were hand-read before being written.
  if (v_sig->>'refers_to_lead')::int < 50 then
    raise exception 'refers_to_lead reads % -- the anchor matched almost nothing; 199 were measured', v_sig->>'refers_to_lead';
  end if;
  if (v_sig->>'commonwealth_in_own_voice')::int < 1 then
    raise exception 'commonwealth_in_own_voice reads 0 -- four rows were measured; the token list or the length bound is broken';
  end if;

  -- the version was actually published AND carries the new rule. Asserting the
  -- rows alone passes in exactly the un-published state this guard exists for.
  select version, compiled_prompt into v_ver, v_prompt
  from styleguide_versions where is_active;
  if v_ver is distinct from '1.5.0' then
    raise exception 'active styleguide version is % -- expected 1.5.0', coalesce(v_ver,'(none)');
  end if;
  if position('Open with the meaning, not with the term' in v_prompt) = 0 then
    raise exception 'v1.5.0 was published without the new rule in its compiled prompt';
  end if;

  raise notice 'OK: rule 315 live, sentinel at 7 keys (refers_to_lead=%, commonwealth_in_own_voice=%), styleguide v%',
    v_sig->>'refers_to_lead', v_sig->>'commonwealth_in_own_voice', v_ver;
end $verify$;

commit;
