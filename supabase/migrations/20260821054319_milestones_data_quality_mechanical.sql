-- Milestones data-quality remediation, phase 1 (mechanical, low-risk fixes).
--
-- Audit found: (a) 10 landmark US milestones (Stonewall, first Pride parade,
-- Obergefell, DADT repeal, Harvey Milk's election, DSM removal, first White
-- House demonstration) had country_name='United States' but country_id NULL,
-- despite an exact countries.name='United States' row existing — these rows
-- were simply never run through country-linking; (b) seo_indexable was
-- inverted on 1,895 rows (1,836 published+approved rows wrongly excluded,
-- 59 still-in-review draft rows wrongly exposed) for the same reason the news
-- table had this bug (20260714192445): the column has no write-path guard;
-- (c) ~11 near-certain duplicate events (Daughters of Bilitis founding, first
-- rainbow Pride flag, Isle of Man sodomy-law repeal, WHO 1990 disease
-- declassification — three separately-worded rows for the same event —, DSM
-- removal, Christopher Street Liberation Day, Harvey Milk/Moscone
-- assassination, ILGA founding, first White House demonstration, Obergefell
-- v. Hodges) that the nightly "milestone key+year" dedup sweep cannot catch
-- because it requires near-identical despaced titles and these are worded
-- differently despite sharing a date and event.

begin;

-- ---------------------------------------------------------------------------
-- 1. Country-id backfill: resolve country_name text to countries.id where an
--    exact (case-insensitive) match exists and isn't already linked. Defunct
--    states (East Germany (GDR), Czechoslovakia) correctly have no match in
--    `countries` and are deliberately left unlinked rather than guessed.
-- ---------------------------------------------------------------------------
update public.milestones m
   set country_id = sub.cid, updated_at = now()
from (
  select m2.id,
    coalesce(
      (select c.country_id from public.cities c where c.id = m2.city_id and c.country_id is not null),
      (select co.id from public.countries co where lower(co.name) = lower(m2.country_name))
    ) as cid
  from public.milestones m2
  where m2.country_id is null
    and m2.country_name is not null and m2.country_name <> ''
    and m2.duplicate_of_id is null
) sub
where m.id = sub.id and sub.cid is not null;

-- Data hygiene: empty-string country_name/location/region on genuinely
-- international events (e.g. WHO/IDAHOBIT) are a data-entry artifact, not a
-- resolvable place — null them out rather than leaving '' (which reads as a
-- linking failure in every audit query above).
update public.milestones
   set country_name = nullif(country_name, ''),
       location      = nullif(location, ''),
       region        = nullif(region, '')
 where duplicate_of_id is null
   and (country_name = '' or location = '' or region = '');

-- ---------------------------------------------------------------------------
-- 2. seo_indexable correction (same class of bug as the news guard,
--    20260714192445_news_seo_indexable_quality_guard.sql). Indexability
--    should track status='published' AND review_status='approved' AND
--    NOT safety_gated. One-directional trigger — it NEVER forces
--    seo_indexable=true, so an admin who deliberately de-indexed a
--    compliant row is respected — plus a one-time two-directional sweep to
--    correct the 1,895 rows already wrong under the old (absent) rule.
-- ---------------------------------------------------------------------------
create or replace function public.milestones_enforce_seo_indexable()
returns trigger
language plpgsql
as $function$
begin
  if (new.status <> 'published' or new.review_status <> 'approved' or new.safety_gated)
     and new.seo_indexable is distinct from false then
    new.seo_indexable := false;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_milestones_enforce_seo_indexable on public.milestones;
create trigger trg_milestones_enforce_seo_indexable
  before insert or update of status, review_status, safety_gated, seo_indexable on public.milestones
  for each row execute function public.milestones_enforce_seo_indexable();

-- One-time correction, both directions.
update public.milestones
   set seo_indexable = false
 where seo_indexable = true
   and (status <> 'published' or review_status <> 'approved' or safety_gated);

update public.milestones
   set seo_indexable = true
 where seo_indexable = false
   and status = 'published' and review_status = 'approved' and not safety_gated;

-- ---------------------------------------------------------------------------
-- 3. Queue the confirmed duplicate pairs into the existing Dedup Truth Engine
--    review surface (dedup_review_queue, already accepts entity_type=
--    'milestone') rather than auto-merging: these are historically
--    significant rows where picking the wrong "keep" is a real content
--    regression, and there are few enough that human review is trivial.
--    Resolved via the existing /admin/inbox?queue=dedup-review UI
--    (approve_dedup_review -> merge_entities('milestone', keep, drop), fully
--    audited and reversible via unmerge_entities).
--
--    Suggested keep_id is computed, not hand-picked: prefer the row with
--    more sources, a longer description, a resolved country_id, then the
--    earlier-created row as a stable tiebreak. The admin can override via
--    approve_dedup_review(id, p_keep_id).
-- ---------------------------------------------------------------------------
with pairs(a, b, match_type) as (
  values
    ('615dfd0b-8cb4-459c-acb8-1e13c5dbc6e8'::uuid, '7f20ce40-3b3c-487a-b8c5-c7f73db5c8fd'::uuid, 'title_year_trigram_manual'),
    ('91bce88f-3116-4831-8849-6581d9028f5b'::uuid, 'f32550cf-7820-48d3-8b92-946b0b3ee577'::uuid, 'title_year_trigram_manual'),
    ('040a2089-943c-45cc-aa9b-0f893e62824f'::uuid, '6c0f95cd-eb85-4177-a4c0-ac4c24d58087'::uuid, 'title_year_trigram_manual'),
    ('4c86cfa8-cc40-46c3-9b41-b6717147e81e'::uuid, 'c74919fc-e778-4844-8ed5-e28d1ef7ce55'::uuid, 'title_year_trigram_manual'),
    ('4c86cfa8-cc40-46c3-9b41-b6717147e81e'::uuid, 'bcd58447-73ab-4725-85b1-fce19ad3e241'::uuid, 'title_year_trigram_manual'),
    ('c74919fc-e778-4844-8ed5-e28d1ef7ce55'::uuid, 'bcd58447-73ab-4725-85b1-fce19ad3e241'::uuid, 'title_year_trigram_manual'),
    ('0f5a51be-1738-40fe-810d-8db2cecad676'::uuid, '5e5ae61c-e844-4cc4-a4af-160da4770a5f'::uuid, 'title_year_trigram_manual'),
    ('a150b5ac-fc4a-4f40-9e9c-1598276ae4f4'::uuid, 'cb76e004-0a04-464d-bdb8-212bc32f550e'::uuid, 'title_year_trigram_manual'),
    ('64a00c25-b02b-4380-a0e4-be5cc91e415c'::uuid, '7f6ef21b-9565-41fc-b5bd-8d2c449acb1d'::uuid, 'title_year_trigram_manual'),
    ('4a54efad-5812-43be-828a-5486ab34caf6'::uuid, 'df99c8aa-92d3-43f1-8d77-94cf06e59013'::uuid, 'title_year_trigram_manual'),
    ('243c7ad5-fc85-4557-8acc-624f1aba94d9'::uuid, 'fe29f3e3-9eb0-468b-948f-1120a8bf05fc'::uuid, 'title_year_exact_date'),
    ('cec0e918-7835-401d-b154-e767de01b70a'::uuid, '5d2a719b-ae5b-41fa-8234-e90d1d34fc5d'::uuid, 'title_year_exact_date')
),
scored as (
  select
    p.a, p.b, p.match_type,
    ma.title as a_title, mb.title as b_title,
    -- higher = more complete; ties broken by earlier created_at
    (coalesce(jsonb_array_length(ma.sources), 0) * 10
      + length(coalesce(ma.description, ''))
      + (case when ma.country_id is not null then 100 else 0 end)) as a_score,
    (coalesce(jsonb_array_length(mb.sources), 0) * 10
      + length(coalesce(mb.description, ''))
      + (case when mb.country_id is not null then 100 else 0 end)) as b_score,
    ma.created_at as a_created, mb.created_at as b_created
  from pairs p
  join public.milestones ma on ma.id = p.a
  join public.milestones mb on mb.id = p.b
),
resolved as (
  select
    case when b_score > a_score or (b_score = a_score and b_created < a_created) then b else a end as keep_id,
    case when b_score > a_score or (b_score = a_score and b_created < a_created) then a else b end as drop_id,
    case when b_score > a_score or (b_score = a_score and b_created < a_created) then b_title else a_title end as keep_title,
    case when b_score > a_score or (b_score = a_score and b_created < a_created) then a_title else b_title end as drop_title,
    match_type
  from scored
)
insert into public.dedup_review_queue (entity_type, keep_id, drop_id, cluster, confidence, reason, source)
select
  'milestone', keep_id, drop_id,
  jsonb_build_object(
    'keep', jsonb_build_object('id', keep_id, 'title', keep_title),
    'drop', jsonb_build_object('id', drop_id, 'title', drop_title),
    'match_type', match_type,
    'auto_eligible', false
  ),
  0.85, match_type, 'data_quality_audit_2026'
from resolved
on conflict do nothing;

commit;
