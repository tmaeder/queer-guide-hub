-- Diagnostic codes for health tags.
--
-- WHY THIS EXISTS
--
-- /tags/:slug is the public glossary. A clinical term — HIV/AIDS, Syphilis,
-- Endometriosis, Truvada — carried prose plus two external anchors (Wikipedia,
-- Wikidata) and nothing else. There was no clinical identifier anywhere in the
-- product: grepping supabase/, src/ and functions/ for ICD-10, ICD-11, SNOMED,
-- MeSH or UMLS returned zero hits before this migration.
--
-- WHICH TAGS ARE "HEALTH RELATED" — THE CATEGORY IS NOT THE ANSWER
--
-- `unified_tags.category` cannot answer this. Measured on prod: the "Sexual
-- Health" category contains ACT UP, Chastity Cage and Lipstick Lesbian; the
-- "Substances & Harm Reduction" category contains mayonnaise, popcorn, wildlife
-- and shipping. Any category-driven rule inherits that noise in both
-- directions.
--
-- So the set is SELF-SELECTING: a tag is health-related iff its Wikidata item
-- carries at least one of the clinical code properties registered below. That
-- one rule answers "which tags" and "what codes" together and needs no
-- curation. Measured on a 50-tag sample drawn from the health categories, 46
-- carry >= 1 code; the misses were Contraceptive patch, Facial feminization
-- surgery, Top surgery — and mayonnaise, which correctly returns nothing.
--
-- MeSH (P486) and UMLS (P2892) are DELIBERATELY NOT REGISTERED. They sit on
-- 40/50 and 38/50 of that same sample — including yoga and meditation. They are
-- cross-reference terminology, not diagnostic codes; registering them would
-- both dilute the band and mark non-clinical tags as clinical.
--
-- WHY A SEPARATE TABLE AND NOT A jsonb COLUMN ON unified_tags
--
-- Two reasons, both load-bearing:
--
--   1. `unified_tags_audit` is an AFTER INSERT OR DELETE OR UPDATE trigger with
--      NO column scope. A jsonb column refreshed weekly would write a full
--      before/after row diff into tag_change_log for every health tag, forever.
--   2. `trg_search_documents_tag` is column-scoped to name, short_description,
--      description, category, slug, image_url, entity_kind, merged_into_id,
--      deprecated_at, status. Writing a separate table touches none of them, so
--      this sync causes ZERO search_documents reindexing. Putting the codes on
--      unified_tags would have made a weekly job storm the search sync on a
--      disk-constrained DB.
--
-- A system can also legitimately carry several codes for one concept (HIV/AIDS
-- has three ICD-9 codes and two ICD-11 codes), so a row per code is the honest
-- shape anyway.

-- ---------------------------------------------------------------------------
-- 1. The code-system vocabulary — also the "link to the source site" mechanism
-- ---------------------------------------------------------------------------
create table if not exists public.medical_code_systems (
  slug                text primary key,
  label               text not null,
  code_group          text not null check (code_group in ('general','specialized','procedural','pharmaceutical')),
  wikidata_property   text,
  -- Property holding the identifier the SOURCE SITE's URL is keyed by, when
  -- that differs from the identifier a human reads. Only ICD-11 needs this:
  -- P7329 is the readable MMS code ("1C62.3") and P7807 is the numeric
  -- foundation id ("1858812010"). Verified in a real browser: the WHO browser
  -- resolves `#1858812010` onto the right concept and does NOTHING at all with
  -- `#GA10` — the readable code is not an addressable key.
  link_property       text,
  -- {code} is substituted with link_code where the system declares a
  -- link_property, else with code. NULL when the issuing body publishes no
  -- addressable per-code page — the UI then shows the bare code and links
  -- home_url instead of fabricating a URL.
  url_template        text,
  home_url            text,
  -- Sanity gate. Wikidata is crowd-maintained and does contain malformed
  -- values (Q12199 carries ICD-10 "B2424." today). A code that fails this is
  -- never stored, because the only thing we do with a code is build a link out
  -- of it and a link built from a malformed code is worse than no link.
  code_pattern        text,
  enabled             boolean not null default true,
  unavailable_reason  text,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  constraint medical_code_systems_enabled_needs_property
    check (not enabled or wikidata_property is not null),
  constraint medical_code_systems_disabled_needs_reason
    check (enabled or unavailable_reason is not null)
);

comment on table public.medical_code_systems is
  'Clinical code systems surfaced on the tag glossary. Disabled rows are a RECORDED GAP, not a silent omission — every system asked for is present here with either a Wikidata property or a reason it cannot be sourced.';
comment on column public.medical_code_systems.link_property is
  'Wikidata property holding the URL key when it differs from the readable code (ICD-11 only: P7329 reads, P7807 links).';
comment on column public.medical_code_systems.code_pattern is
  'Codes failing this regex are rejected by the sync. Wikidata carries malformed values and a link built from one is worse than no link.';

-- ---------------------------------------------------------------------------
-- 2. The codes themselves
-- ---------------------------------------------------------------------------
create table if not exists public.tag_medical_codes (
  id            uuid primary key default gen_random_uuid(),
  tag_id        uuid not null references public.unified_tags(id) on delete cascade,
  system_slug   text not null references public.medical_code_systems(slug) on delete cascade,
  code          text not null,
  link_code     text,
  source        text not null default 'wikidata' check (source in ('wikidata','editorial')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (tag_id, system_slug, code)
);

create index if not exists idx_tag_medical_codes_tag on public.tag_medical_codes(tag_id);
create index if not exists idx_tag_medical_codes_system on public.tag_medical_codes(system_slug);

comment on table public.tag_medical_codes is
  'Clinical codes per glossary tag, derived weekly from Wikidata. Deliberately NOT a column on unified_tags: that table has an unscoped audit trigger and a column-scoped search-sync trigger, and a weekly refresh there would storm both.';

-- ---------------------------------------------------------------------------
-- 3. RLS + grants. A policy without a grant is unreachable in this project.
-- ---------------------------------------------------------------------------
alter table public.medical_code_systems enable row level security;
grant select on public.medical_code_systems to anon, authenticated;
grant all on public.medical_code_systems to service_role;

drop policy if exists medical_code_systems_public_read on public.medical_code_systems;
create policy medical_code_systems_public_read on public.medical_code_systems
  for select using (true);

alter table public.tag_medical_codes enable row level security;
grant select on public.tag_medical_codes to anon, authenticated;
grant all on public.tag_medical_codes to service_role;

drop policy if exists tag_medical_codes_public_read on public.tag_medical_codes;
create policy tag_medical_codes_public_read on public.tag_medical_codes
  for select using (true);

-- ---------------------------------------------------------------------------
-- 4. Seed — every system named in the request, enabled or explicitly not
-- ---------------------------------------------------------------------------
insert into public.medical_code_systems
  (slug, label, code_group, wikidata_property, link_property, url_template, home_url, code_pattern, enabled, unavailable_reason, sort_order)
values
  -- ── General ────────────────────────────────────────────────────────────
  ('icd_11','ICD-11','general','P7329','P7807',
   'https://icd.who.int/browse/2025-01/mms/en#/{code}',
   'https://icd.who.int/browse/2025-01/mms/en',
   '^[0-9A-Z]{2}[0-9A-Z.]{0,10}$', true, null, 10),
  ('icd_10','ICD-10','general','P494',null,
   'https://icd.who.int/browse10/2019/en#/{code}',
   'https://icd.who.int/browse10/2019/en',
   '^[A-Z][0-9]{2}(\.[0-9]{1,3})?$', true, null, 20),
  ('icd_10_cm','ICD-10-CM','general','P4229',null,
   'https://www.icd10data.com/search?s={code}',
   'https://www.icd10data.com/ICD10CM/Codes',
   '^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$', true, null, 30),
  ('icd_9','ICD-9','general','P493',null,
   'http://www.icd9data.com/getICD9Code.ashx?icd9={code}',
   'http://www.icd9data.com/',
   '^([EV]?[0-9]{2,4})(\.[0-9]{1,2})?$', true, null, 40),
  ('icd_9_cm','ICD-9-CM','general','P1692',null,
   'http://www.icd9data.com/getICD9Code.ashx?icd9={code}',
   'http://www.icd9data.com/',
   '^([EV]?[0-9]{2,4})(\.[0-9]{1,2})?$', true, null, 50),
  ('icpc_2','ICPC-2','general','P667',null,
   null,
   'https://www.who.int/standards/classifications/other-classifications/international-classification-of-primary-care',
   '^[A-Z][0-9]{2}$', true, null, 60),
  ('diseases_db','DiseasesDB (DRC)','general','P557',null,
   'http://www.diseasesdatabase.com/ddb{code}.htm',
   'http://www.diseasesdatabase.com/',
   '^[0-9]{1,6}$', true, null, 70),
  ('snomed_ct','SNOMED CT','general','P5806',null,
   'https://browser.ihtsdotools.org/?perspective=full&conceptId1={code}',
   'https://browser.ihtsdotools.org/',
   '^[0-9]{6,18}$', true, null, 80),
  ('nanda','NANDA','general',null,null,null,
   'https://nanda.org/',null,false,
   'No Wikidata property exists and the NANDA-I taxonomy is licensed — no free machine-readable source.',90),
  ('read_codes','Read codes','general',null,null,null,
   'https://isd.digital.nhs.uk/trud',null,false,
   'No Wikidata property exists; Read/CTV3 distribution requires an NHS TRUD licence.',100),
  ('snomed_axes','SNOMED D / P / C axis','general',null,null,null,
   'https://browser.ihtsdotools.org/',null,false,
   'The D, P and C axes belong to SNOMED RT, retired in 2002. Superseded by SNOMED CT — see the snomed_ct row.',110),

  -- ── Specialized ────────────────────────────────────────────────────────
  ('icd_o','ICD-O','specialized','P563',null,
   null,
   'https://www.who.int/standards/classifications/other-classifications/international-classification-of-diseases-for-oncology',
   '^[0-9]{4}/[0-9]$', true, null, 10),
  ('dsm_5','DSM-5','specialized','P1930',null,
   null,
   'https://www.psychiatry.org/psychiatrists/practice/dsm',
   '^[0-9A-Z][0-9A-Z.-]{0,12}$', true, null, 20),
  ('dsm_iv','DSM-IV','specialized','P663',null,
   null,
   'https://www.psychiatry.org/psychiatrists/practice/dsm',
   '^[0-9A-Z][0-9A-Z.-]{0,12}$', true, null, 30),
  ('icsd','ICSD','specialized',null,null,null,
   'https://aasm.org/clinical-resources/international-classification-sleep-disorders/',null,false,
   'No Wikidata property and no free per-code source for the International Classification of Sleep Disorders.',40),
  ('ichd','ICHD','specialized',null,null,null,
   'https://ichd-3.org/',null,false,
   'No Wikidata property. ICHD-3 is readable online but has no machine-readable per-concept mapping we can derive.',50),
  ('ilds','ILDS','specialized',null,null,null,
   'https://ilds.org/',null,false,
   'No Wikidata property and no free machine-readable source for the International League of Dermatological Societies coding.',60),
  ('bpa','BPA','specialized',null,null,null,null,null,false,
   'No Wikidata property and no free machine-readable source for the British Paediatric Association classification.',70),
  ('ccmd_3','CCMD-3','specialized',null,null,null,null,null,false,
   'No Wikidata property and no free machine-readable source for the Chinese Classification of Mental Disorders.',80),
  ('osiics','OSIICS','specialized',null,null,null,
   'https://bjsm.bmj.com/content/54/7/397',null,false,
   'No Wikidata property; the Orchard Sports Injury and Illness Classification has no per-concept mapping we can derive.',90),

  -- ── Procedural ─────────────────────────────────────────────────────────
  ('icd_10_pcs','ICD-10-PCS','procedural','P1690',null,
   'https://www.icd10data.com/search?s={code}',
   'https://www.icd10data.com/ICD10PCS/Codes',
   '^[0-9A-Z]{7}$', true, null, 10),
  ('hcpcs','HCPCS Level II','procedural','P7410',null,
   null,
   'https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system',
   '^[A-V][0-9]{4}$', true, null, 20),
  -- No per-code template: klassifikationen.bfarm.de/ops/code/<code> and
  -- .../kode-suche/htmlgm2024/ both 404 (checked), and the OPS browser is a
  -- year-versioned SPA with no addressable per-code page.
  ('ops_301','OPS-301','procedural','P1691',null,
   null,
   'https://www.bfarm.de/EN/Code-systems/Classifications/OPS-ICHI/OPS/_node.html',
   '^[0-9][0-9a-z.-]{2,12}$', true, null, 30),
  ('loinc','LOINC','procedural','P4338',null,
   'https://loinc.org/{code}/',
   'https://loinc.org/',
   '^[0-9]{1,5}-[0-9]$', true, null, 40),
  ('cpt','CPT (HCPCS Level I)','procedural',null,null,null,
   'https://www.ama-assn.org/practice-management/cpt',null,false,
   'CPT is AMA copyright — republishing the code set is prohibited, so it can never be stored here.',50),
  ('icd_9_cm_vol3','ICD-9-CM Volume 3','procedural',null,null,null,
   'http://www.icd9data.com/',null,false,
   'No Wikidata property distinct from P1692, which carries the DIAGNOSIS codes (Volumes 1-2), not procedures.',60),
  ('ichi','ICHI','procedural',null,null,null,
   'https://icd.who.int/dev11/l-ichi/en',null,false,
   'No Wikidata property; ICHI is still a WHO beta with no stable per-code source.',70),
  ('nic','NIC','procedural',null,null,null,null,null,false,
   'No Wikidata property; the Nursing Interventions Classification is licensed by Elsevier.',80),
  ('opcs_4','OPCS-4','procedural',null,null,null,
   'https://isd.digital.nhs.uk/trud',null,false,
   'No Wikidata property; OPCS-4 distribution requires an NHS TRUD licence.',90),
  ('ccam','CCAM','procedural',null,null,null,
   'https://www.atih.sante.fr/ccam',null,false,
   'No Wikidata property and no free machine-readable per-code source for the French CCAM.',100),

  -- ── Pharmaceutical ─────────────────────────────────────────────────────
  ('atc','ATC','pharmaceutical','P267',null,
   'https://www.whocc.no/atc_ddd_index/?code={code}',
   'https://www.whocc.no/atc_ddd_index/',
   '^[A-Z]([0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?)?$', true, null, 10),
  ('ndc','NDC','pharmaceutical','P3640',null,
   'https://ndclist.com/ndc/{code}',
   'https://ndclist.com/',
   '^[0-9]{4,5}-[0-9]{3,4}(-[0-9]{1,2})?$', true, null, 20),
  ('din','DIN','pharmaceutical',null,null,null,
   'https://health-products.canada.ca/dpd-bdpp/',null,false,
   'No Wikidata property; Health Canada''s Drug Identification Number has no free per-concept mapping we can derive.',30)
on conflict (slug) do update set
  label = excluded.label,
  code_group = excluded.code_group,
  wikidata_property = excluded.wikidata_property,
  link_property = excluded.link_property,
  url_template = excluded.url_template,
  home_url = excluded.home_url,
  code_pattern = excluded.code_pattern,
  enabled = excluded.enabled,
  unavailable_reason = excluded.unavailable_reason,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 5. The sync — pure SQL, same shape as run_tag_wikidata_hierarchy
-- ---------------------------------------------------------------------------
-- Structure copied deliberately from
-- 20260724260000_tag_wikidata_hierarchy.sql: the `http` extension, an
-- unambiguous QID->tag map, and batched wbgetentities at 45 QIDs/call. That
-- job has been running weekly since 2026-07 and this is the same corpus and
-- the same API. The claim reading differs — see the comment on _ent below.
--
-- The property list is read FROM medical_code_systems, so registering a new
-- system later is one INSERT and no function change.

create extension if not exists http with schema extensions;

create or replace function public.run_tag_medical_codes_sync(p_chunk int default 45)
returns table (
  codes_inserted int, codes_refreshed int, codes_removed int, codes_rejected int,
  tags_matched int, systems_hit int, ambiguous_qids int, api_errors int
)
language plpgsql security definer set search_path = public as $$
declare
  v_ins int := 0; v_ref int := 0; v_del int := 0; v_rej int := 0;
  v_tags int := 0; v_sys int := 0; v_ambig int := 0; v_apierr int := 0;
  -- `now()` and NOT clock_timestamp(): it is the transaction timestamp, which
  -- is exactly what the DEFAULTs and the DO UPDATE below write. With
  -- clock_timestamp() every freshly inserted row would have first_seen_at
  -- EARLIER than the marker and the insert/refresh split would report every
  -- row as a refresh.
  v_started timestamptz := now();
begin
  perform public.assert_admin_or_internal();
  set local statement_timeout = '240s';
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '15');
  perform extensions.http_set_curlopt('CURLOPT_USERAGENT',
    'QueerGuide/1.0 (https://queer.guide; contact@queer.guide)');

  -- Unambiguous QID -> tag map. A QID shared by two of our tags is never used:
  -- attaching a clinical code to the wrong one of a duplicate pair is exactly
  -- the class of error the tag merge engine exists to clean up.
  -- `(array_agg(id order by id))[1]` and not `min(id)`: unified_tags.id is a
  -- uuid and Postgres has no min(uuid) aggregate. This is the same trap the
  -- hierarchy job hit — see 20260724260500_fix_wikidata_hierarchy_min_uuid.sql.
  -- Only c = 1 rows survive the delete below, so the pick is cosmetic anyway.
  create temp table _map on commit drop as
    select wikidata_id as qid, (array_agg(id order by id))[1] as tag_id, count(*) as c
    from public.unified_tags
    where status = 'active' and wikidata_id ~ '^Q[0-9]+$'
    group by wikidata_id;
  select count(*) into v_ambig from _map where c > 1;
  delete from _map where c > 1;

  create temp table _sys on commit drop as
    select slug, wikidata_property, link_property, code_pattern
    from public.medical_code_systems
    where enabled and wikidata_property is not null;

  -- One http_get per chunk of QIDs.
  create temp table _fetch on commit drop as
    with ids as (select qid, (row_number() over (order by qid) - 1) as rn from _map),
    grp as (
      select rn / greatest(p_chunk, 1) as g, string_agg(qid, '|' order by qid) as ids
      from ids group by rn / greatest(p_chunk, 1)
    )
    select g.g,
      (extensions.http_get(
        'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' || g.ids
        || '&props=claims&format=json')).content as raw
    from grp g;
  select count(*) into v_apierr from _fetch where raw is null or left(raw, 1) <> '{';

  -- Parse each RESPONSE once and explode it into one small row per entity.
  --
  -- This is the difference between a job that finishes and one that does not.
  -- The obvious shape — `_map cross join _sys`, casting `f.raw::jsonb` inside
  -- the join — re-parses a multi-megabyte response body once per (tag, system)
  -- pair: 1,561 tags x 18 systems = ~28,000 parses of the same 35 documents.
  -- The hierarchy job this is modelled on gets away with the naive shape only
  -- because it reads two properties, not eighteen.
  create temp table _ent on commit drop as
    select e.key as qid, e.value -> 'claims' as claims
    from _fetch f
    cross join lateral jsonb_each((f.raw::jsonb) -> 'entities') e
    where f.raw is not null and left(f.raw, 1) = '{';

  -- Tags whose chunk came back cleanly. Only these are eligible for the
  -- removal pass below — a failed chunk must never be read as "Wikidata no
  -- longer has codes for these tags".
  create temp table _covered on commit drop as
    select distinct m.tag_id from _map m join _ent e on e.qid = m.qid;

  -- Extract every code value, plus the link key where the system needs one.
  --
  -- Two filters that look optional and are not:
  --   * rank <> 'deprecated' — Wikidata keeps known-WRONG identifiers as
  --     deprecated statements rather than deleting them. Ingesting those
  --     republishes an error the source has already retracted.
  --   * snaktype = 'value' — `novalue`/`somevalue` snaks carry no datavalue at
  --     all and would arrive as SQL NULL.
  create temp table _codes on commit drop as
    select tag_id, system_slug, code, min(link_code) as link_code
    from (
      select m.tag_id,
             s.slug as system_slug,
             st -> 'mainsnak' -> 'datavalue' ->> 'value' as code,
             -- `count(*) = 1` and not `limit 1`: Wikidata stores the readable
             -- codes and the URL keys as two INDEPENDENT statement lists with
             -- no pairing between them. Q12199 carries two ICD-11 codes
             -- (1C62.3, 1C62.3Z) and one foundation id — picking the first
             -- would link both codes to whichever concept that id happens to
             -- be, silently sending a reader to the wrong one. Ambiguity
             -- yields NULL, and the UI then shows the bare codes.
             case when s.link_property is null then null else (
               select case when count(*) = 1
                           then min(lk -> 'mainsnak' -> 'datavalue' ->> 'value') end
               from jsonb_array_elements(coalesce(e.claims -> s.link_property, '[]'::jsonb)) lk
               where coalesce(lk ->> 'rank', 'normal') <> 'deprecated'
                 and lk -> 'mainsnak' ->> 'snaktype' = 'value'
             ) end as link_code
      from _map m
      join _ent e on e.qid = m.qid
      cross join _sys s
      cross join lateral jsonb_array_elements(
        coalesce(e.claims -> s.wikidata_property, '[]'::jsonb)
      ) st
      where coalesce(st ->> 'rank', 'normal') <> 'deprecated'
        and st -> 'mainsnak' ->> 'snaktype' = 'value'
    ) x
    where code is not null and btrim(code) <> ''
    group by tag_id, system_slug, code;

  -- Reject malformed values rather than publishing a link built from one.
  select count(*) into v_rej
  from _codes c join _sys s on s.slug = c.system_slug
  where s.code_pattern is not null and c.code !~ s.code_pattern;

  delete from _codes c using _sys s
  where s.slug = c.system_slug and s.code_pattern is not null and c.code !~ s.code_pattern;

  -- Second half of the ICD-11 pairing guard: one URL key cannot stand for two
  -- readable codes either. If a tag ended up with several codes in a system
  -- that needs a link key, drop the key rather than point them all at one
  -- concept.
  update _codes c set link_code = null
  where c.link_code is not null
    and (select count(*) from _codes c2
         where c2.tag_id = c.tag_id and c2.system_slug = c.system_slug) > 1;

  select count(distinct tag_id), count(distinct system_slug) into v_tags, v_sys from _codes;

  insert into public.tag_medical_codes (tag_id, system_slug, code, link_code, source)
  select tag_id, system_slug, code, link_code, 'wikidata' from _codes
  on conflict (tag_id, system_slug, code) do update
    set last_seen_at = now(),
        link_code = excluded.link_code;
  get diagnostics v_ins = row_count;

  select count(*) into v_ref
  from public.tag_medical_codes
  where source = 'wikidata' and last_seen_at >= v_started and first_seen_at < v_started;
  v_ins := v_ins - v_ref;

  -- Retract codes Wikidata no longer carries — but only for tags we actually
  -- fetched this run, only for systems still enabled, and never editorial
  -- rows. Scoping to `_sys` matters: without it, DISABLING a system in the
  -- vocabulary (a display decision) would silently delete all of its stored
  -- codes on the next run.
  with gone as (
    delete from public.tag_medical_codes t
    where t.source = 'wikidata'
      and t.tag_id in (select tag_id from _covered)
      and t.system_slug in (select slug from _sys)
      and not exists (
        select 1 from _codes c
        where c.tag_id = t.tag_id and c.system_slug = t.system_slug and c.code = t.code
      )
    returning 1
  )
  select count(*) into v_del from gone;

  return query select v_ins, v_ref, v_del, v_rej, v_tags, v_sys, v_ambig, v_apierr;
end $$;

revoke all on function public.run_tag_medical_codes_sync(int) from public;
grant execute on function public.run_tag_medical_codes_sync(int) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Public read — mirrors get_tag_ontology (SECURITY DEFINER, anon-callable)
-- ---------------------------------------------------------------------------
-- The URL is composed server-side so the client never has to know a template.
-- A system with no url_template yields url = null and the caller renders the
-- bare code next to home_url.

create or replace function public.get_tag_medical_codes(p_tag_id uuid)
returns jsonb
language sql security definer stable set search_path = public as $$
  select coalesce(
    jsonb_object_agg(g.code_group, g.items),
    '{}'::jsonb
  )
  from (
    select s.code_group,
           jsonb_agg(
             jsonb_build_object(
               'system', s.slug,
               'label', s.label,
               'code', c.code,
               -- A system that needs a link key and has none yields NO url.
               -- Falling back to the readable code here would compose
               -- `icd.who.int/...#1C62.3`, which was tested in a real browser
               -- and silently does nothing — a dead link that looks live.
               'url', case
                        when s.url_template is null then null
                        when s.link_property is not null and c.link_code is null then null
                        else replace(s.url_template, '{code}', coalesce(c.link_code, c.code))
                      end,
               'home_url', s.home_url
             )
             order by s.sort_order, c.code
           ) as items
    from public.tag_medical_codes c
    join public.medical_code_systems s on s.slug = c.system_slug
    where c.tag_id = p_tag_id and s.enabled
    group by s.code_group
  ) g;
$$;

revoke all on function public.get_tag_medical_codes(uuid) from public;
grant execute on function public.get_tag_medical_codes(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Weekly cron. Registry row FIRST — admin_automations is the record of
-- record, and sync_automations_to_cron() recreates any enabled row whose job
-- is missing. Retiring this means disabling the row, never deleting it.
-- ---------------------------------------------------------------------------
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('tag_medical_codes_sync','Tag medical codes',
        'Weekly: pulls ICD/SNOMED/ATC/LOINC-class codes from Wikidata for every QID-anchored tag -> tag_medical_codes (pure SQL, http ext). Writes no column on unified_tags, so it causes no search reindex.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_tag_medical_codes_sync"}'::jsonb, '30 5 * * 1')
on conflict (slug) do update set schedule = excluded.schedule, enabled = excluded.enabled,
  description = excluded.description, name = excluded.name, action = excluded.action,
  trigger = excluded.trigger;

select cron.schedule('tag_medical_codes_sync', '30 5 * * 1',
  $cron$ select public.run_tag_medical_codes_sync(); $cron$);
