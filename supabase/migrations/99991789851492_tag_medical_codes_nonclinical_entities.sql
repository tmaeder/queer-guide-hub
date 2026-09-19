-- Round eighteen — THE BAND IS TITLED "DIAGNOSTIC CODES" AND SOME OF IT IS NOT
-- DIAGNOSTIC AT ALL.
--
-- Round seventeen removed clinical codes left behind by a DISOWNED entity. This
-- one is the opposite case and is why the framing it inherited was wrong: every
-- identifier below is CORRECT. `/tags/australia` really is Q408 Australia,
-- `/tags/jockstrap` really is Q10940. What is wrong is that SNOMED CT, ICD-11
-- and ICPC-2 are not diagnosis vocabularies — they are reference terminologies
-- with whole axes for geography, occupations, kinship, physical objects, places
-- and social circumstances. The sync copies a code from any registered property
-- without asking what KIND of thing the entity is, so a band headed "Diagnostic
-- codes" publishes, on active tags:
--
--   australia      SNOMED 223621005   Australia (geographic location)
--   south-africa   SNOMED 223549008   South Africa
--   south-america  SNOMED 223504005   South America
--   espana         SNOMED 223680008   Spain
--   estonia        SNOMED 223650003   Estonia
--   california     SNOMED 224043007   California
--   bakery         SNOMED 224838001   bakery (environment)
--   nurses         SNOMED 106292003   nurse (occupation)
--   doctor         SNOMED 112247003   medical doctor
--   jurist         SNOMED 106303002   jurist
--   anthropologist SNOMED  50835006   anthropologist
--   nephew         SNOMED  83559000   nephew (person in family)
--   jockstrap      ICD-11  XE16J      extension code, object
--   prison         ICD-11  XE30E      extension code, place
--   poverty        ICPC-2  Z01        social-problem chapter
--
-- Eight of the fifteen are `seo_indexable`. Nothing here is a wrong FACT — a
-- reader is simply told that "Bakery" and "Nephew" have diagnostic codes, on a
-- platform whose clinical band exists so that a health term carries its real
-- identifiers. It is the `mayonnaise under Sexual Health` class in the clinical
-- register, and the harm is to the band's credibility rather than to a fact.
--
-- MEASURED AND REJECTED: A CODE-PATTERN RULE. The cheap fix is to refuse code
-- shapes — SNOMED `223*`/`224*` is geography, ICD-11 `XE` is the object/place
-- extension, ICPC-2 `Z` is the social chapter. Run against the real rows that
-- catches 10 of the 15 and misses the entire occupation/kinship half, because
-- SNOMED concept ids are OPAQUE: 50835006, 106292003, 106303002, 112247003 and
-- 83559000 share no prefix with each other or with the geography block. So the
-- discriminator has to be the ENTITY, not the code, which is also the honest
-- framing: the code is real, the entity is not clinical.
--
-- THE CLASSES COST NOTHING TO OBTAIN. P31/P279 ride in the same `claims` blob
-- `wikidata_entities_fetch` already returns, which is the `_shared/city-class-
-- guard.ts` precedent — zero extra requests per entity.
--
-- IT IS A DENYLIST, INVERTING city-class-guard's POLARITY ON PURPOSE. There a
-- QID is adopted only on a positively recognised settlement class, because a
-- wrong link is permanent and self-reinforcing (the weekly rebuild regenerates
-- wrong facts forever). Here the asymmetry runs the other way: refusing wrongly
-- DELETES a legitimate clinical code from a health page, while missing one
-- leaves a single odd row until the vocabulary is extended — and the next run
-- then removes it, because nothing is frozen. Over-refusal is the expensive
-- error, so an unrecognised class is ALLOWED and counted, never refused.
--
-- THE CLINICAL OVERRIDE IS CHECKED FIRST AND THE ORDER IS LOAD-BEARING. This is
-- CLAUDE.md's `\bprefecture\b` lesson: a disqualifying class must not veto an
-- entity that ALSO carries a clinical one. Measured, it rescues exactly two --
-- `substance abuse` (Q3184856) and `substance dependence` (Q3378593), both
-- classed `social issue` AND `type of disease`, both carrying real ICD codes. A
-- blanket deny on `social issue` would have stripped them; `poverty` (Q10294)
-- carries no clinical class at all, which is what separates the three.
--
-- MEASURED AND REJECTED: ADDING `crime` TO THE VOCABULARY. Of the 135 entities
-- with codes exactly two carry a crime class — Q157833 `embezzlement` (a wrong
-- identifier, repaired in the sibling migration) and `substance abuse`, which
-- the clinical override rescues anyway. So `crime` would cost nothing TODAY and
-- is still left out: this platform documents `spiking`, `sexual-assault` and
-- `stealthing`, and an abuse concept that legitimately carries an ICD code is
-- classed a crime with no clinical sibling. Under-reaching is the correct error.
--
-- A REAPER, NOT A PRODUCER GATE, and the alternative was real. Gating inside
-- `run_tag_medical_codes_sync` where `_codes` is built would be internally
-- consistent by construction (one snapshot decides both the codes and their
-- verdict) and would retract for free, since a refused tag stays in `_covered`.
-- It is rejected because `CREATE OR REPLACE` restates the whole body, and that
-- body is the SOLE WRITER of clinical codes on a health platform: a slip in a
-- 100-line transcription breaks the pipeline silently, where a missed reaper
-- week leaves fifteen already-known rows in place seven more days. The blast
-- radius decides it. It also matches this subsystem's own precedent — round
-- seventeen added a reaper rather than touching the sync — and CLAUDE.md's
-- `*_tick()` rule, that wrappers exist so reviewed bodies are not restated.
-- The insert-then-reap churn is invisible because pg_cron runs the whole
-- command string in ONE transaction, so no reader ever sees the intermediate
-- state and a newly-coded tag is gated the same week it appears.
--
-- THE VERDICT IS STORED, and that is what makes the sentinel possible at all.
-- `tag_medical_code_signals()` is pure SQL and STABLE; it cannot fetch. Without
-- a stored verdict the invariant could only be recomputed by the thing it is
-- meant to audit. `tag_entity_class_probe` also makes the vocabulary's GAPS
-- namable — an unrecognised class shows up as a rising count of real QIDs
-- rather than as silence, the property city-class-guard's report was built for.
--
-- NO NETWORK IN THIS MIGRATION. The recurring reaper fetches; the one-shot
-- repair does not. `db push` aborts the whole repo on a failing file, so a
-- migration that waits on api.wikidata.org is a repo-wide outage waiting for a
-- slow upstream. The probe is instead SEEDED with the classes measured today
-- for all 135 code-bearing entities, and the deletion is driven by the same
-- verdict function the cron will use — so if the vocabulary is wrong the seeded
-- rows simply do not refuse and nothing is deleted. The seed is evidence, not
-- an id list: no slug or code is named in the DELETE.

-- ------------------------------------------------------------- the vocabulary
create or replace function public.medical_code_entity_class_verdict(p_classes text[])
returns text
language sql
immutable
as $verdict$
  select case
    -- Clinical FIRST. The order is the whole override: an entity carrying both
    -- `social issue` and `type of disease` is a disease that also happens to be
    -- a social issue, and must keep its codes.
    when p_classes is null or cardinality(p_classes) = 0 then 'unknown'
    when p_classes && array[
      'Q112193867', -- type of disease
      'Q12136',     -- disease
      'Q2057971',   -- health problem
      'Q12029',     -- addiction
      'Q7632070',   -- substance use disorder
      'Q18123741',  -- infectious disease
      'Q12135',     -- mental disorder
      'Q112965645', -- symptom or sign
      'Q169872',    -- symptom
      'Q112826905', -- class of anatomical entity
      'Q112826975', -- particular anatomical entity
      'Q113145171', -- type of chemical entity
      'Q11173',     -- chemical compound
      'Q79529',     -- chemical substance
      'Q1931388',   -- cause of death
      'Q179630',    -- syndrome
      'Q712378',    -- organ
      'Q12140'      -- medication
    ] then 'clinical'
    when p_classes && array[
      -- places
      'Q6256',      -- country
      'Q3624078',   -- sovereign state
      'Q35657',     -- U.S. state
      'Q5107',      -- continent
      'Q855697',    -- subcontinent
      'Q41176',     -- building
      'Q213441',    -- shop
      'Q811979',    -- built structure
      'Q137863866', -- type of prison facility
      'Q137864285', -- prison facility
      -- people-by-role
      'Q12737077',  -- occupation
      'Q28640',     -- profession
      'Q3922583',   -- health profession
      'Q15987302',  -- legal profession
      'Q66811410',  -- medical profession
      'Q108300140', -- occupation group according to ISCO-08
      'Q11974939',  -- health professional
      'Q192581',    -- job activity
      'Q189533',    -- academic degree
      'Q4164871',   -- position
      'Q83856136',  -- legal position
      'Q702269',    -- professional
      -- kinship
      'Q171318',    -- kinship
      'Q1199677',   -- kinship relation
      'Q76477',     -- niece or nephew
      'Q130248800', -- male relative
      -- circumstance and object
      'Q1920219',   -- social issue
      'Q11460'      -- clothing
    ] then 'refused'
    else 'unknown'
  end;
$verdict$;

comment on function public.medical_code_entity_class_verdict(text[]) is
  'Denylist gate for the "Diagnostic codes" band. Given an entity''s P31+P279 class QIDs, returns clinical | refused | unknown. Clinical is tested FIRST so a disqualifying class cannot veto an entity that also carries a clinical one. An unrecognised class returns unknown and is ALLOWED: over-refusal deletes a real clinical code, under-refusal leaves one odd row until the vocabulary is extended.';

-- ------------------------------------------------------------- the probe table
create table if not exists public.tag_entity_class_probe (
  qid        text primary key,
  classes    text[] not null default '{}'::text[],
  verdict    text   not null,
  checked_at timestamptz not null default now()
);

comment on table public.tag_entity_class_probe is
  'Last-known P31/P279 classes of every Wikidata entity that backs a tag_medical_codes row, with the verdict medical_code_entity_class_verdict() returned for them. Exists so tag_medical_code_signals() — pure SQL, STABLE, cannot fetch — can report the non-clinical invariant without re-deriving it from the thing it audits.';

alter table public.tag_entity_class_probe enable row level security;
revoke all on table public.tag_entity_class_probe from public, anon, authenticated;
grant select, insert, update, delete on table public.tag_entity_class_probe to service_role;

-- Seed: the classes measured for all 135 code-bearing entities. `on conflict do
-- update` rather than a bare insert, so a concurrent session that probed first
-- is corrected rather than aborting the push.
insert into public.tag_entity_class_probe (qid, classes, verdict, checked_at)
-- s.classes is CAST EXPLICITLY. A bare '{...}' literal in a VALUES list
-- resolves to `text`, not `text[]`, so the verdict call fails 42883 and takes
-- the whole push with it. Found by dry-running the seed, not by reading it.
select s.qid, s.classes::text[], public.medical_code_entity_class_verdict(s.classes::text[]), now()
  from (values
    ('Q101896','{Q112193867,Q18554947,Q18555940,Q18557550,Q26695958,Q3041498,Q56369564,Q56603543}'),
    ('Q1026040','{Q169251,Q2057971}'),
    ('Q10294','{Q11424100,Q151885,Q1920219,Q3505845}'),
    ('Q1049021','{Q108268872,Q112193867,Q1814820,Q205555,Q290620}'),
    ('Q1053501','{Q1085588,Q15748953,Q4131496,Q73523825}'),
    ('Q10737','{Q17089549,Q1881552,Q1931388,Q2438541,Q26256810,Q4072473,Q844482}'),
    ('Q1081574','{Q112826905,Q1406501,Q43022214,Q66515784,Q712378}'),
    ('Q10940','{Q100505188,Q11460}'),
    ('Q1128431','{Q102186786,Q112965645,Q120395,Q18211693}'),
    ('Q11995','{Q1490716,Q7189713}'),
    ('Q1211892','{Q112826905,Q1406501,Q66515784}'),
    ('Q12131','{Q937228}'),
    ('Q12198','{Q131345497,Q1662340,Q18123741}'),
    ('Q12199','{Q112193867,Q112965645,Q12131931,Q12136,Q12184,Q12198,Q179630,Q18556697,Q506680}'),
    ('Q131207','{Q100434640,Q115922057,Q116221438,Q79529}'),
    ('Q1318776','{Q113145171,Q49847565}'),
    ('Q1416773','{Q112193867,Q18553247,Q18975069,Q54912126}'),
    ('Q1473749','{Q112193867,Q130487634,Q2507260,Q392604,Q55785750,Q55787628,Q55787661,Q929833}'),
    ('Q15224724','{Q1199677,Q130248800,Q171318,Q76477}'),
    ('Q1527023','{Q10968643,Q1231428,Q905726,Q9332}'),
    ('Q1537534','{Q15636229,Q25091577}'),
    ('Q15410178','{Q11173,Q113145171}'),
    ('Q154430','{Q104776867,Q112965645,Q169872}'),
    ('Q154869','{Q112193867,Q1983841}'),
    ('Q157833','{Q1236391,Q130583773,Q1456832,Q1772449,Q20820018,Q5449702,Q5655527,Q83267}'),
    ('Q15787','{Q55983715}'),
    ('Q15965523','{Q102186582,Q112965645,Q168800,Q178061}'),
    ('Q159979','{Q1207505,Q25671}'),
    ('Q16533','{Q108300140,Q15987302,Q185351,Q4994773,Q6302990,Q83856136}'),
    ('Q166102','{Q112193867,Q2112703,Q5442760}'),
    ('Q167178','{Q112193867,Q18123741,Q4059324,Q929451}'),
    ('Q174723','{Q113145171,Q4303473}'),
    ('Q175854','{Q112193867,Q181032,Q44619,Q544006}'),
    ('Q1772397','{Q10611388}'),
    ('Q179996','{Q121144720,Q170744,Q59199015,Q72801119}'),
    ('Q18','{Q15042037,Q2418896,Q5107,Q855697}'),
    ('Q180007','{Q102186875,Q112965645,Q16669556}'),
    ('Q183548','{Q112193867,Q178059,Q2275640}'),
    ('Q184674','{Q102186786,Q112193867,Q112965645,Q138747250}'),
    ('Q185351','{Q15987302,Q189533,Q702269}'),
    ('Q186360','{Q108290334,Q12737077,Q192581,Q3922583}'),
    ('Q188641','{Q103843042,Q112826905,Q112826975,Q206718,Q546776,Q66558307}'),
    ('Q1889215','{Q1053501}'),
    ('Q190965','{Q15404978,Q4135211,Q48264,Q7189713}'),
    ('Q191','{Q179164,Q3624078,Q6256,Q63791824,Q7270}'),
    ('Q191521','{Q11173,Q113145171}'),
    ('Q191924','{Q109195877,Q113145171,Q44909815}'),
    ('Q19275831','{Q112193867,Q18558209,Q1931388,Q4330029}'),
    ('Q192995','{Q1773974,Q179661,Q4677560}'),
    ('Q193840','{Q105688,Q1441305,Q1931388}'),
    ('Q1973610','{Q112826905,Q112826975,Q2256181,Q4620674}'),
    ('Q198504','{Q113145171,Q2689559}'),
    ('Q202387','{Q112193867,Q3089469,Q815296}'),
    ('Q205764','{Q112193867,Q18553772}'),
    ('Q205972','{Q16879474,Q18621601,Q865968}'),
    ('Q207133','{Q112193867,Q130487634,Q21082526,Q54943934,Q55785627,Q55786715,Q55789112,Q7458487}'),
    ('Q207791','{Q112193867,Q178059,Q182116,Q608}'),
    ('Q208726','{Q101971,Q112193867,Q18211693,Q18554834,Q18555046,Q54959539,Q56603543,Q665258}'),
    ('Q2151786','{Q112193867,Q170082,Q4134457}'),
    ('Q2192288','{Q112826905,Q112826975,Q25553420,Q4620674,Q66511876}'),
    ('Q2412859','{Q119892838,Q1779868}'),
    ('Q258','{Q3624078,Q6256}'),
    ('Q26963','{Q113145171,Q76389918}'),
    ('Q274393','{Q1252971,Q213441,Q41176}'),
    ('Q282902','{Q113145171,Q4303473}'),
    ('Q29','{Q1250464,Q179671,Q3624078,Q51576574,Q6256}'),
    ('Q309438','{Q3511132,Q41014950,Q483313}'),
    ('Q3184856','{Q110207349,Q112193867,Q1920219,Q2057971,Q83267}'),
    ('Q319312','{Q112193867,Q47528917}'),
    ('Q3241252','{Q112193867,Q179630,Q2275677,Q303555}'),
    ('Q337554','{Q1191065,Q242165}'),
    ('Q3378593','{Q112193867,Q182413}'),
    ('Q3505252','{Q114953}'),
    ('Q373822','{Q112193867,Q1361144,Q140421694,Q7574983}'),
    ('Q3851652','{Q134445920,Q182442}'),
    ('Q39631','{Q108300140,Q11974939,Q122754124,Q12737077,Q3922583,Q4164871,Q66811410}'),
    ('Q4007235','{Q112193867,Q676191}'),
    ('Q40357','{Q137863866,Q137864285,Q178706,Q811979}'),
    ('Q407535','{Q113145171,Q4303473}'),
    ('Q407541','{Q113145171,Q422693,Q59348943,Q72400550}'),
    ('Q407592','{Q113145171,Q27089018}'),
    ('Q407617','{Q113145171,Q126615335}'),
    ('Q408','{Q202686,Q223832,Q3624078,Q43702,Q6256}'),
    ('Q408471','{Q113145171,Q193430}'),
    ('Q409721','{Q113145171,Q277954,Q29849244,Q76644541}'),
    ('Q410374','{Q113145171,Q73266145}'),
    ('Q41083','{Q112193867,Q1243869,Q56369564}'),
    ('Q411441','{Q113145171,Q4303473}'),
    ('Q4118295','{Q12140,Q169336}'),
    ('Q413805','{Q113145171,Q15843633,Q76605311}'),
    ('Q421352','{Q113145171,Q11320751,Q177911}'),
    ('Q421552','{Q11173,Q113145171}'),
    ('Q422188','{Q113145171,Q27167012}'),
    ('Q422244','{Q11173,Q59199015}'),
    ('Q422442','{Q109653162,Q113145171}'),
    ('Q422631','{Q113145171,Q2689559,Q47069735}'),
    ('Q422645','{Q113145171,Q899851}'),
    ('Q424965','{Q113145171,Q72470946}'),
    ('Q42844','{Q11076418,Q112193867,Q317309}'),
    ('Q43405','{Q10791,Q112193867,Q178059,Q1914636,Q2275640}'),
    ('Q464215','{Q1383948}'),
    ('Q4773904','{Q15319501,Q28640}'),
    ('Q498902','{Q179630}'),
    ('Q5065704','{Q11173,Q113145171}'),
    ('Q5130800','{Q112193867,Q18556242,Q356033}'),
    ('Q5160454','{Q112193867,Q15304507,Q41083}'),
    ('Q54795','{Q2167872,Q66543709,Q66544116}'),
    ('Q5521314','{Q11173,Q113145171}'),
    ('Q574491','{Q100751718,Q112965645,Q1322382,Q770709}'),
    ('Q58713','{Q113145171,Q72084374,Q72580449,Q72801119}'),
    ('Q616181','{Q112193867,Q55788310,Q62665995}'),
    ('Q622106','{Q1076521,Q18554379}'),
    ('Q622527','{Q169872,Q177719,Q193078,Q2866472,Q4072473,Q451967}'),
    ('Q62614','{Q11364,Q422137,Q422812,Q56256173}'),
    ('Q6279182','{Q102187224,Q112965645,Q12136,Q852376}'),
    ('Q654426','{Q112965645,Q117134054,Q12047512,Q30897648,Q3500368}'),
    ('Q666412','{Q112826905,Q112826975,Q66425236,Q712378}'),
    ('Q676191','{Q112193867,Q18211693}'),
    ('Q694552','{Q112193867,Q1416773,Q153356}'),
    ('Q696490','{Q169872,Q208450}'),
    ('Q745865','{Q112193867,Q55009397}'),
    ('Q7476596','{Q112193867,Q54931661,Q54959539,Q6473911,Q6742925}'),
    ('Q7632070','{Q112193867,Q4134457}'),
    ('Q804521','{Q112193867,Q676191,Q727028}'),
    ('Q81025','{Q112826905,Q112826975,Q1239288,Q40397}'),
    ('Q81225','{Q113145171,Q4303473}'),
    ('Q83871','{Q3706669,Q55499636,Q72084374}'),
    ('Q8392','{Q112193867,Q1242529,Q178059,Q2275640}'),
    ('Q905750','{Q113145171,Q424418}'),
    ('Q907160','{Q104631433,Q113145171}'),
    ('Q937224','{Q113145171,Q126612889}'),
    ('Q944142','{Q169872,Q47319077,Q9420}'),
    ('Q9612','{Q103812529,Q112826905,Q112826975,Q4620674,Q66545296}'),
    ('Q9614','{Q112826905,Q112826975,Q3355930,Q66561296}'),
    ('Q99','{Q35657}')
  ) as s(qid, classes)
on conflict (qid) do update
  set classes = excluded.classes,
      verdict = excluded.verdict,
      checked_at = excluded.checked_at;

-- ---------------------------------------------------------------- the reaper
create or replace function public.run_tag_medical_codes_reap_nonclinical(p_chunk integer default 45)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $reap$
declare
  v_raw           text;
  v_deadline      timestamptz;
  v_fetch_errors  int := 0;
  v_probed        int := 0;
  v_deleted       int := 0;
  v_refused_tags  int := 0;
  v_refused       jsonb;
  v_unknown       int := 0;
  v_unknown_cls   jsonb;
  r record;
begin
  perform public.assert_admin_or_internal();
  v_deadline := public.http_fanout_deadline(interval '100 seconds');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT', '10');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');
  perform extensions.http_set_curlopt('CURLOPT_USERAGENT',
    'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)');

  -- Scope: entities that actually back a code row today. The editorial lane is
  -- exempt here exactly as it is in the sync and in round seventeen's reaper.
  create temp table _want on commit drop as
    select distinct t.wikidata_id as qid
      from public.tag_medical_codes m
      join public.unified_tags t on t.id = m.tag_id
     where m.source is distinct from 'editorial'
       and t.wikidata_id ~ '^Q[0-9]+$';

  create temp table _cls (qid text primary key, classes text[]) on commit drop;

  for r in
    with ids as (select qid, (row_number() over (order by qid) - 1) as rn from _want)
    select string_agg(qid, '|' order by qid) as ids
      from ids
     group by rn / greatest(p_chunk, 1)
     order by min(rn)
  loop
    if clock_timestamp() > v_deadline then
      v_fetch_errors := v_fetch_errors + 1;
      continue;
    end if;

    v_raw := public.wikidata_entities_fetch(r.ids);
    if v_raw is null then
      v_fetch_errors := v_fetch_errors + 1;
      continue;
    end if;

    begin
      insert into _cls (qid, classes)
      select e.key,
             coalesce((
               select array_agg(distinct st -> 'mainsnak' -> 'datavalue' -> 'value' ->> 'id')
                 from jsonb_array_elements(
                        coalesce(e.value -> 'claims' -> 'P31',  '[]'::jsonb)
                     || coalesce(e.value -> 'claims' -> 'P279', '[]'::jsonb)) st
                where coalesce(st ->> 'rank', 'normal') <> 'deprecated'
                  and st -> 'mainsnak' ->> 'snaktype' = 'value'
                  and st -> 'mainsnak' -> 'datavalue' -> 'value' ->> 'id' is not null
             ), '{}'::text[])
        from jsonb_each((v_raw::jsonb) -> 'entities') e
        -- A `missing` entity is an ANSWER ABOUT WIKIDATA, not about the tag.
        -- Letting it through would overwrite a good stored probe with an empty
        -- class list — absence of evidence recorded as evidence of absence,
        -- which is how 6,498 venues were written off when logo.dev's token died.
       where not (e.value ? 'missing')
      on conflict (qid) do nothing;
    exception when others then
      v_fetch_errors := v_fetch_errors + 1;
    end;
  end loop;

  select count(*) into v_probed from _cls;

  -- Store the verdict. This is what lets the STABLE, pure-SQL sentinel report
  -- the invariant without re-deriving it from the pipeline it audits.
  insert into public.tag_entity_class_probe (qid, classes, verdict, checked_at)
  select c.qid, c.classes, public.medical_code_entity_class_verdict(c.classes), now()
    from _cls c
  on conflict (qid) do update
    set classes    = excluded.classes,
        verdict    = excluded.verdict,
        checked_at = excluded.checked_at;

  -- Only entities fetched successfully THIS run are eligible. A chunk that
  -- failed contributes no _cls rows, so its tags keep their codes — the
  -- `_covered` discipline the sync already uses, for the same reason.
  with doomed as (
    select m.id, t.slug
      from public.tag_medical_codes m
      join public.unified_tags t on t.id = m.tag_id
      join _cls c on c.qid = t.wikidata_id
     where m.source is distinct from 'editorial'
       and public.medical_code_entity_class_verdict(c.classes) = 'refused'
  ), gone as (
    delete from public.tag_medical_codes x
     using doomed d
     where x.id = d.id
    returning d.slug
  )
  select count(*), count(distinct slug), coalesce(jsonb_agg(distinct slug), '[]'::jsonb)
    into v_deleted, v_refused_tags, v_refused
    from gone;

  -- The vocabulary's own gaps, named rather than silent: a class this gate does
  -- not recognise is ALLOWED, so a growing list here is the only way a missing
  -- deny term becomes visible.
  select count(*) into v_unknown
    from _cls c
   where public.medical_code_entity_class_verdict(c.classes) = 'unknown';

  select coalesce(jsonb_agg(distinct x.cls), '[]'::jsonb) into v_unknown_cls
    from _cls c
    cross join lateral unnest(c.classes) as x(cls)
   where public.medical_code_entity_class_verdict(c.classes) = 'unknown';

  return jsonb_build_object(
    'probed',        v_probed,
    'fetch_errors',  v_fetch_errors,
    'deleted_codes', v_deleted,
    'refused_tags',  v_refused_tags,
    'refused',       coalesce(v_refused, '[]'::jsonb),
    'unknown_verdicts', v_unknown,
    'unknown_classes',  coalesce(v_unknown_cls, '[]'::jsonb)
  );
end
$reap$;

revoke all on function public.run_tag_medical_codes_reap_nonclinical(integer) from public, anon, authenticated;
grant execute on function public.run_tag_medical_codes_reap_nonclinical(integer) to service_role;

comment on function public.run_tag_medical_codes_reap_nonclinical(integer) is
  'Weekly: re-reads P31/P279 for every entity backing a tag_medical_codes row, stores the verdict in tag_entity_class_probe, and deletes non-editorial codes on entities medical_code_entity_class_verdict() refuses. Only entities fetched successfully this run are eligible, so a Wikidata outage retracts nothing.';

-- --------------------------------------------------------------- the sentinel
create or replace function public.tag_medical_code_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with scoped as (
    select m.id, m.source, t.slug, t.status, t.seo_indexable, t.wikidata_id,
           coalesce(t.status = 'active' and t.wikidata_id ~ '^Q[0-9]+$', false) as syncable
      from public.tag_medical_codes m
      join public.unified_tags t on t.id = m.tag_id
  ),
  live as (
    select s.*, p.verdict, p.checked_at
      from scoped s
      left join public.tag_entity_class_probe p on p.qid = s.wikidata_id
     where s.source is distinct from 'editorial'
  )
  select jsonb_build_object(
    'probe_ok', true,
    -- Coverage FIRST: zero orphans over an empty table is not a clean corpus.
    'code_rows_total', (select count(*) from scoped),
    'tags_total',      (select count(distinct slug) from scoped),
    -- Round seventeen's zero-invariant. A code on a tag the sync cannot refresh
    -- is frozen prose of the clinical kind — only ever stale, never corrected.
    'orphan_code_rows', (select count(*) from scoped where not syncable and source is distinct from 'editorial'),
    'orphan_tags',      (select count(distinct slug) from scoped where not syncable and source is distinct from 'editorial'),
    'orphan_examples', (
      select coalesce(jsonb_agg(distinct slug), '[]'::jsonb)
        from scoped where not syncable and source is distinct from 'editorial'),
    -- Round eighteen's zero-invariant: a "Diagnostic codes" band publishing a
    -- code for a country, an occupation, a garment or a kinship relation.
    'nonclinical_code_rows', (select count(*) from live where verdict = 'refused'),
    'nonclinical_tags',      (select count(distinct slug) from live where verdict = 'refused'),
    'nonclinical_examples',  (select coalesce(jsonb_agg(distinct slug), '[]'::jsonb) from live where verdict = 'refused'),
    -- COVERAGE OF THAT INVARIANT, reported separately and deliberately not
    -- folded into it: an unprobed entity contributes zero refused rows, so
    -- "nonclinical_code_rows = 0" over an unprobed corpus is vacuous rather
    -- than clean, and only this number tells the two apart.
    'unprobed_qids', (select count(distinct wikidata_id) from live where verdict is null and syncable),
    'probe_rows',    (select count(*) from public.tag_entity_class_probe),
    -- The vocabulary's gaps, as a number that can rise. `unknown` is ALLOWED by
    -- design, so this is a backlog signal and never a gate.
    'unknown_verdict_qids', (select count(distinct wikidata_id) from live where verdict = 'unknown'),
    'probe_stale_days', (
      select coalesce(floor(extract(epoch from (now() - min(checked_at))) / 86400)::int, 0)
        from live where verdict is not null),
    -- Reported separately: the editorial lane is exempt from both reapers by
    -- design, so it must never be folded into either invariant above.
    'editorial_rows', (select count(*) from scoped where source = 'editorial')
  );
$function$;

revoke all on function public.tag_medical_code_signals() from public, anon, authenticated;
grant execute on function public.tag_medical_code_signals() to service_role;

-- ------------------------------------------------------------------- the cron
-- Edited directly, which for an `action->>'type'='rpc'` registry row is the
-- convention and not the `detect_stale_venues` mistake: that row carries no
-- `action.command`, so sync_automations_to_cron()'s branch (d) structurally
-- cannot reschedule it and no reconciler can overwrite this. cron.schedule()
-- upserts by jobname; the schedule is restated unchanged so the job does not
-- silently move, and round seventeen's reap_orphans is restated with it so the
-- rewrite cannot drop a call the previous round added.
select cron.schedule(
  'tag_medical_codes_sync',
  '30 5 * * 1',
  ' set statement_timeout = ''600s''; select public.run_tag_medical_codes_sync(); select public.run_tag_medical_codes_reap_orphans(); select public.run_tag_medical_codes_reap_nonclinical(); '
);

-- ---------------------------------------------------------------- the repair
-- Driven by the verdict function over the seeded probe, NOT by a list of slugs
-- or codes: if the vocabulary is wrong the seeded rows do not refuse and this
-- deletes nothing, which is the self-check a frozen id list cannot give.
delete from public.tag_medical_codes m
 using public.unified_tags t, public.tag_entity_class_probe p
 where t.id = m.tag_id
   and p.qid = t.wikidata_id
   and m.source is distinct from 'editorial'
   and public.medical_code_entity_class_verdict(p.classes) = 'refused';

do $verify$
declare
  v_bad     int;
  v_slugs   text;
  v_healthy int;
  v_sig     jsonb;
begin
  -- 1. THE VOCABULARY FUNCTION'S OWN BEHAVIOUR, asserted directly rather than
  --    inferred from the rows it happened to touch. The first case is the one
  --    that matters: clinical must beat a disqualifying class, in both orders.
  if public.medical_code_entity_class_verdict(array['Q1920219', 'Q112193867']) <> 'clinical'
     or public.medical_code_entity_class_verdict(array['Q112193867', 'Q1920219']) <> 'clinical' then
    raise exception 'round eighteen: the clinical override does not beat a deny class';
  end if;
  if public.medical_code_entity_class_verdict(array['Q1920219']) <> 'refused' then
    raise exception 'round eighteen: a deny class alone does not refuse';
  end if;
  if public.medical_code_entity_class_verdict(array['Q00000000']) <> 'unknown'
     or public.medical_code_entity_class_verdict('{}'::text[]) <> 'unknown'
     or public.medical_code_entity_class_verdict(null) <> 'unknown' then
    raise exception 'round eighteen: an unrecognised, empty or null class list must read unknown, never refused';
  end if;

  -- 2. The fifteen named bands are gone, BY NAME — a count is equally satisfied
  --    by a slug that left the corpus entirely. `justice` is here too: it is
  --    refused on class (legal profession) as well as carrying a wrong
  --    identifier, which the sibling migration clears.
  select count(*), coalesce(string_agg(distinct t.slug, ', ' order by t.slug), '')
    into v_bad, v_slugs
    from public.tag_medical_codes m
    join public.unified_tags t on t.id = m.tag_id
   where t.slug in ('anthropologist', 'australia', 'bakery', 'california', 'doctor',
                    'espana', 'estonia', 'jockstrap', 'jurist', 'justice', 'nephew',
                    'nurses', 'poverty', 'prison', 'south-africa', 'south-america');
  if v_bad <> 0 then
    raise exception 'round eighteen: % non-clinical code row(s) still published (%)', v_bad, v_slugs;
  end if;

  -- 3. THE MIRROR, and it is the assertion that stops a sweep. The clinical
  --    override exists for exactly two entities; if a later edit turns the gate
  --    into a blanket deny on `social issue` these lose their real ICD codes
  --    and every "zero non-clinical rows" check above still passes.
  select count(*) into v_healthy
    from public.tag_medical_codes m
    join public.unified_tags t on t.id = m.tag_id
   where t.wikidata_id in ('Q3184856', 'Q3378593');
  if v_healthy < 2 then
    raise exception 'round eighteen: the clinical override lost its rescued rows — only % survive', v_healthy;
  end if;

  -- 4. The working corpus survived. "Zero non-clinical" is equally satisfied by
  --    an empty table.
  select count(*) into v_healthy from public.tag_medical_codes;
  if v_healthy < 370 then
    raise exception 'round eighteen: only % code rows remain — the reap over-reached', v_healthy;
  end if;

  -- 5. The invariant corpus-wide, through the sentinel's own definition, with
  --    its COVERAGE asserted beside it: nonclinical_code_rows = 0 over an
  --    unprobed corpus is vacuous, not clean.
  v_sig := public.tag_medical_code_signals();
  if coalesce((v_sig->>'nonclinical_code_rows')::int, -1) <> 0 then
    raise exception 'round eighteen: sentinel reports % non-clinical code row(s)', v_sig->>'nonclinical_code_rows';
  end if;
  if coalesce((v_sig->>'unprobed_qids')::int, -1) <> 0 then
    raise exception 'round eighteen: % code-bearing entities have no class probe — the invariant is measuring nothing', v_sig->>'unprobed_qids';
  end if;
  if coalesce((v_sig->>'probe_rows')::int, 0) < 130 then
    raise exception 'round eighteen: only % probe rows — the seed did not land', v_sig->>'probe_rows';
  end if;
  if coalesce((v_sig->>'code_rows_total')::int, 0) < 370 then
    raise exception 'round eighteen: sentinel reports a near-empty table — it is measuring nothing, not passing';
  end if;
  -- Round seventeen's invariant must still hold: this file must not have
  -- reintroduced an orphan by deleting around one.
  if coalesce((v_sig->>'orphan_code_rows')::int, -1) <> 0 then
    raise exception 'round eighteen: round seventeen''s orphan invariant regressed';
  end if;

  -- 6. The LIVE cron runs all three, on its original schedule. Asserted against
  --    cron.job rather than the registry — the rpc row has no action.command —
  --    and per CLAUDE.md's rule to verify a rescheduled cron live rather than
  --    assume it from the migration file.
  select count(*) into v_bad
    from cron.job
   where jobname = 'tag_medical_codes_sync'
     and command ilike '%run_tag_medical_codes_sync%'
     and command ilike '%run_tag_medical_codes_reap_orphans%'
     and command ilike '%run_tag_medical_codes_reap_nonclinical%'
     and schedule = '30 5 * * 1'
     and active;
  if v_bad <> 1 then
    raise exception 'round eighteen: the live cron does not run sync-then-both-reaps on its original schedule';
  end if;
end
$verify$;
